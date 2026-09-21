# SEC-007 — Socket.IO accepts unauthenticated connections and trusts client-supplied identities

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V13.1.3 – API URLs/parameters do not expose sensitive data; V13.2.1 – Authenticated API methods verify authorisation; V4.2.1 – Verify sensitive data/APIs are protected against IDOR |
| CWE | CWE-306 – Missing Authentication for Critical Function; CWE-639 – Authorization Bypass Through User-Controlled Key |
| Status | Open |
| Affected component | `index.js:119-452`, `services/chatService.js`, `services/appointmentService.js` |

## Summary

The Socket.IO server is created with no authentication middleware, no origin restriction and no authorisation on any event handler. Every handler takes the identity it operates on — `senderId`, `receiverId`, `userId`, `patientId` — directly from the client's event payload and trusts it.

Anyone on the internet can connect a WebSocket client, claim to be any user, and read that user's entire clinician chat history and teleconsultation details. Several handlers additionally use `io.emit`, broadcasting call and patient payloads to **every connected socket** regardless of room membership.

This is not a parallel path to the same weaknesses as the REST API — it is *worse*. Socket.IO bypasses the payload-encryption middleware, the route logger, the rate limiter and every auth middleware, while calling the same service layer. It is a second, entirely unguarded front door.

## Affected code

`index.js:119-122` — the server is instantiated with no options and no middleware:

```js
const socket = require("socket.io");
const io = socket(httpServer);          // :120  no cors option, no io.use(...)

io.on("connection", (socket) => {       // :122  every connection accepted
```

There is no `io.use(...)` anywhere in the file. There is no `handshake.auth` or `handshake.headers` inspection. The `corsOptions` defined at `index.js:48-53` apply to the Express app only; Socket.IO maintains its own CORS configuration, which is unset here.

**Identity is taken from the payload.** `index.js:216-223` — reading another user's chat history:

```js
socket.on('getChatHistory', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
    const chatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
    callback({ success: true, ..., chatHistory });          // returned straight to the caller
});
```

`index.js:123-134` — joining arbitrary rooms:

```js
socket.on('joinRoom', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
    const senderRoom   = `${senderId}_${senderType}_${receiverId}_${receiverType}`;
    const receiverRoom = `${receiverId}_${receiverType}_${senderId}_${senderType}`;
    socket.join(senderRoom);            // :130  room name built entirely from client input
    socket.join(receiverRoom);          // :131
```

`index.js:136-170` — `sendMessage` writes a `Chat` row with a caller-chosen `senderId`, then emits both parties' full chat list and history into the rooms.

Every other handler follows the same pattern: `getChatList` (`:206`), `fetchPatientCallDetail` (`:236`), `listen` (`:248`), `incomingCallListUpdate` (`:277`), `acceptedCallByDoctor` (`:393`).

**Broadcast to all sockets.** Six handlers use `io.emit` rather than `io.to(room).emit`:

```
index.js:299, 329, 357, 401, 421, 440
```

`io.emit` sends to **every connected client**. A passive attacker who merely connects and listens receives call details and patient payloads for the whole platform without sending a single event.

**Injection sink.** `index.js:206-213` routes `userId` and `userType` into `ChatService.getChatList`, which passes them into `sequelizeDB1.literal()` at `services/chatService.js:276-278` — raw SQL, in plaintext, from an unauthenticated socket. See [SEC-006](SEC-006-sql-injection.md).

## Technical detail

Socket.IO connections are authenticated at the **handshake**, using `io.use((socket, next) => ...)`, which runs once per connection before any event is dispatched. Nothing of the kind exists here, so the connection carries no identity, and each handler independently invents one from its payload.

Room names are derived from client input rather than from a verified session, which makes `socket.join` an authorisation decision delegated to the attacker. Knowing (or guessing) two integer ids is sufficient to join the room carrying that conversation and receive its messages in real time as they are sent.

Three aggravating factors:

- **The encryption layer does not apply.** `validateDataEncryption` is Express middleware; socket events never traverse it. Whatever obscurity the payload layer provided on REST routes is absent here, and payloads are plain JSON.
- **The rate limiter does not apply.** `express-rate-limit` is mounted on `app.use('/api', ...)`. Socket traffic is unmetered, so enumeration of the `senderId`/`receiverId` space is unthrottled.
- **The route logger does not apply.** `routeLogger` is Express middleware, so socket activity produces no audit record at all. An attacker reading the entire chat corpus over WebSocket leaves no trace in the `logs` table.

`socket.on('disconnect')` handling and connection limits are also absent, so unbounded connections can be opened.

## Exploit scenario

**Harvesting clinician–patient conversations**

1. Attacker points any Socket.IO client at the production server. No credentials are required; the connection is accepted.
   ```js
   const io = require('socket.io-client');
   const s = io('https://patientportalapi.akosmd.in');
   ```
2. Attacker enumerates conversations by iterating small integer ids:
   ```js
   for (let patientId = 1; patientId < 10000; patientId++) {
     for (let doctorId = 1; doctorId < 200; doctorId++) {
       s.emit('getChatHistory',
         { senderId: patientId, senderType: 1, receiverId: doctorId, receiverType: 2 },
         (res) => { if (res.chatHistory?.length) save(res.chatHistory); });
     }
   }
   ```
3. Each callback returns the full message history for that pair — clinical discussion, symptoms, medication queries — with no authentication and no rate limit.

**Passive collection**

4. Alternatively, the attacker connects and simply listens. The six `io.emit` broadcasts deliver call details and patient payloads for the entire platform to every connected socket.

**Impersonation**

5. Attacker emits `sendMessage` with `senderId` set to a clinician's id, injecting a message that the patient's client renders as coming from their doctor — a credible phishing or clinical-misinformation vector.

**Escalation**

6. Attacker emits `getChatList` with `userId: "1 AND (SELECT SLEEP(5))"` to reach the `Sequelize.literal()` sink and pivot to full database extraction ([SEC-006](SEC-006-sql-injection.md)).

## Impact

- **Confidentiality:** unauthenticated read of all clinician–patient chat transcripts and teleconsultation metadata — among the most sensitive data the platform holds.
- **Integrity:** messages can be written as any user, including impersonating clinicians.
- **Availability:** unbounded unauthenticated connections; no limits configured.
- **Auditability:** socket activity is not logged at all, so this access is invisible to the existing (already inadequate) audit trail.
- **Regulatory:** disclosure of treatment communications. HIPAA §164.312(a)(1) access control and §164.312(b) audit controls are both unmet on this transport.

## Remediation

**Step 1 — authenticate the handshake.**

```js
// index.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/secret');

const io = require('socket.io')(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,            // the same explicit allow-list as the Express app
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e6,                 // 1 MB, not the 100 MB default
});

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'patientportalapi',
            audience: 'patientportal',
        });
        socket.user = { id: decoded.id, role: decoded.role, companyId: decoded.companyId };
        return next();
    } catch (err) {
        return next(new Error('unauthorized'));   // fail closed
    }
});
```

**Step 2 — derive identity from `socket.user`, never from the payload.**

```js
const typeForRole = { patient: 1, doctor: 2, careNavigator: 3 };

socket.on('getChatHistory', async ({ peerId, peerType }, callback) => {
    try {
        const selfId   = socket.user.id;                  // from the verified token
        const selfType = typeForRole[socket.user.role];

        if (!Number.isInteger(Number(peerId))) return callback({ success: false });
        if (!await ChatService.conversationExistsBetween(selfId, selfType, peerId, peerType)) {
            return callback({ success: false, error: 'forbidden' });   // explicit authorisation check
        }

        const chatHistory = await ChatService.getChatHistory(selfId, selfType, peerId, peerType);
        callback({ success: true, chatHistory });
    } catch (err) {
        callback({ success: false });                     // never return err.message — see SEC-025
    }
});
```

**Step 3 — build room names server-side.**

```js
// Canonical, order-independent room id derived from verified identity.
function roomFor(aId, aType, bId, bType) {
    const a = `${aType}:${aId}`, b = `${bType}:${bId}`;
    return a < b ? `chat:${a}|${b}` : `chat:${b}|${a}`;
}

socket.on('joinRoom', async ({ peerId, peerType }, callback) => {
    if (!await ChatService.conversationExistsBetween(socket.user.id, typeForRole[socket.user.role], peerId, peerType)) {
        return callback({ success: false, error: 'forbidden' });
    }
    const room = roomFor(socket.user.id, typeForRole[socket.user.role], peerId, peerType);
    socket.join(room);                       // one canonical room, not two mirrored ones
    callback({ success: true });
});
```

**Step 4 — replace every `io.emit` with a targeted emit.** Audit `index.js:299, 329, 357, 401, 421, 440` and scope each to the specific room or user socket that should receive it. `io.emit` should not appear in this file at all.

**Step 5 — supporting hardening.**

- Rate-limit socket events per connection (a simple token bucket in the `io.use` middleware).
- Log socket events to the same audit trail as HTTP requests, with the same field allow-list ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).
- Handle `disconnect` and cap concurrent connections per authenticated user.
- Re-verify the token periodically on long-lived connections, or disconnect on token expiry, so revocation ([SEC-017](SEC-017-jwt-hardening-gaps.md)) takes effect.
- Move the socket handlers out of `index.js` into a dedicated module; 330 lines of business logic in the bootstrap file is why this surface was not reviewed alongside the routers.

## Verification

1. **Anonymous connection:** connect with no `auth.token`. The connection must be refused with `unauthorized`. Before the fix it succeeds.
2. **Forged identity:** connect with patient A's valid token, then emit `getChatHistory` with patient B's id as the peer. Must return `forbidden`.
3. **Room isolation:** connect two clients as unrelated users; confirm neither receives the other's `chatHistory`, `chatList` or call events.
4. **Broadcast check:** `grep -n "io.emit(" index.js` returns no results.
5. **Injection check:** emit `getChatList` with `userId: "1 AND (SELECT SLEEP(5))"` — the response must not be delayed (covered jointly with SEC-006).
6. **Expiry:** connect with a token, let it expire, confirm the connection is terminated rather than serving indefinitely.

## References

- Socket.IO — [Middlewares and authentication](https://socket.io/docs/v4/middlewares/)
- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP ASVS 4.0.3 — V13 API and Web Service Verification Requirements
- CWE-306 — [Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
