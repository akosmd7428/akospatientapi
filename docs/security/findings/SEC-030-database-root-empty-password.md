# SEC-030 — Database runs as `root` with an empty password; schema sync on every boot

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 6.8 (`AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V1.2.1 – Unique low-privilege account per component; V14.1.3 – Applications run with least privilege; V8.3.4 – Sensitive data access restricted |
| CWE | CWE-250 – Execution with Unnecessary Privileges; CWE-1188 – Insecure Default Initialization; CWE-521 – Weak Password Requirements |
| Status | Open |
| Affected component | `.env`, `config/dbConfig.js`, `config/sequelize.js`, `index.js` |

## Summary

The application connects to MySQL as `root` **with an empty password**. There is no privilege separation between the application and the database administrator, so any SQL injection — and this codebase has eighteen injectable statements ([SEC-006](SEC-006-sql-injection.md)) — escalates immediately from "read the application's data" to full MySQL administrative control, including `FILE` privilege for reading and writing arbitrary files on the host.

Separately, `sequelizeDB1.sync()` runs on every application start, issuing schema-modifying statements against the production database as part of normal boot.

A tracked config file also contains placeholder credentials (`'user2'` / `'password2'`), which is a template inviting a real credential to be pasted into a git-tracked file.

## Affected code

`.env:6-7` — the credential:

```
DB_USER1=root
DB_PASSWORD1=
```

Consumed at `config/dbConfig.js:2-11` → `config/sequelize.js:4-9`.

`config/dbConfig.js:12-18` — placeholder credentials in a tracked file:

```js
db2: {
    DB_USER: 'user2',
    DB_PASSWORD: 'password2',
    DB_NAME: 'database2',
}
```

Currently unused — `config/sequelize.js:11-16` has the `db2` instance commented out — so this is a latent hazard rather than a live one.

`index.js:106` — schema sync at startup:

```js
sequelizeDB1.sync()
  .then(() => {
    console.log('Database synced');
    httpServer.listen(PORT, ...);
  })
```

`config/sequelize.js` specifies no `ssl`/`dialectOptions`, so the application-to-database connection appears to be unencrypted.

**Positive note:** `config/sequelize.js:7` sets `logging: false`, so SQL statements and their bound PHI parameters are not echoed to stdout.

## Technical detail

**Why `root` matters beyond the empty password.** The empty password is only exploitable by someone who can reach the MySQL port — presumably localhost or a private subnet, which is why this is rated Medium rather than Critical. The larger issue is the **privilege level**, which is exploitable remotely through the application itself:

| Privilege held | What an SQL injection gains |
|---|---|
| `FILE` | `LOAD_FILE('/var/www/patientportalapi/.env')` → `JWT_SECRET` and every third-party key ([SEC-032](SEC-032-secret-sprawl-working-tree.md)). `SELECT … INTO OUTFILE` → write a webshell or overwrite application source. |
| `ALL PRIVILEGES ON *.*` | Read every schema on the instance, not only this application's. |
| `CREATE USER`, `GRANT` | Establish persistence independent of the application. |
| `SUPER` | Disable logging, kill connections, alter runtime configuration. |

A least-privilege account with only `SELECT, INSERT, UPDATE, DELETE` on one schema would confine the same injection to that schema's data. That is the difference between a data incident and a host compromise.

**The empty password compounds lateral movement.** If MySQL is bound to anything other than `127.0.0.1`, anyone who reaches the port authenticates as `root` with no credential at all. Any other workload on the same host or subnet — a compromised container, a monitoring agent, a colocated staging app — reaches the PHI database directly, bypassing the application entirely.

**`sync()` in production.** `sequelize.sync()` issues `CREATE TABLE IF NOT EXISTS` and, with options, `ALTER TABLE`. Running it at every boot means the production schema is mutable by a code deployment with no migration review, no ordering guarantee and no rollback path. It also requires DDL privileges that the runtime account should not hold. On a large table an unexpected `ALTER` can lock it for the duration, taking the service down.

**Unencrypted database connection.** Without `ssl` in `dialectOptions`, PHI travels between application and database in clear text. Within a single host this is low risk; across a network segment or a managed database service it is not.

## Exploit scenario

**Escalation from SQL injection to host compromise**

1. Attacker exploits the unauthenticated SQL injection in [SEC-006](SEC-006-sql-injection.md) via the `companyId` header.
2. Because the connection is `root`, `FILE` is available:
   ```sql
   SELECT LOAD_FILE('/var/www/patientportalapi/.env');
   ```
3. The response contains `JWT_SECRET`, `AES_SECRET_KEY`, SendGrid, Razorpay, OpenTok, SMS and lab-integration credentials.
4. With `JWT_SECRET`, the attacker forges tokens for any user and role — bypassing authentication entirely and rendering every access-control fix moot.
5. With `INTO OUTFILE`, they write to any path the MySQL process can reach, establishing persistence.
6. With a least-privilege account, steps 2–5 all fail; the attacker is confined to the application's own tables.

**Lateral movement**

7. Any compromised workload able to reach the MySQL port connects as `root` with no password and reads the PHI database directly.

## Impact

- **Confidentiality:** SQL injection escalates to secrets on disk and every schema on the instance.
- **Integrity:** DDL and arbitrary file writes.
- **Availability:** `DROP`, or a `sync()`-triggered table lock at deploy time.
- **Scope:** changed — compromise extends from the database to the host.
- **Compliance:** HIPAA §164.308(a)(4) requires access to ePHI to be limited to what is appropriate; running as `root` is the opposite of the minimum-necessary principle.

## Remediation

**Step 1 — create a least-privilege application account.**

```sql
CREATE USER 'portal_app'@'10.0.1.%' IDENTIFIED BY '<32+ random characters>';

GRANT SELECT, INSERT, UPDATE, DELETE ON patientportal.* TO 'portal_app'@'10.0.1.%';
-- Deliberately NOT granted: FILE, SUPER, CREATE, DROP, ALTER, GRANT OPTION,
-- and no privileges on any other schema.

FLUSH PRIVILEGES;
```

Host-scope the account (`'10.0.1.%'`, not `'%'`) so the credential is unusable from outside the application subnet.

A separate, more restricted account for the log store is worthwhile too — `INSERT` only on `logs`, so a compromise of the application cannot rewrite its own audit trail ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

**Step 2 — set a real password and store it properly.** 32+ random characters, in a secret manager rather than a `.env` file on disk ([SEC-032](SEC-032-secret-sprawl-working-tree.md)). Add a startup assertion that `DB_PASSWORD1` is non-empty and refuse to boot otherwise:

```js
if (!process.env.DB_PASSWORD1 || process.env.DB_PASSWORD1.length < 16) {
    throw new Error('DB_PASSWORD1 is missing or too short');
}
```

**Step 3 — set a password on `root` regardless,** and restrict it to `localhost`. Even after the application stops using it, an empty-password `root` is a standing risk.

**Step 4 — replace `sync()` with versioned migrations.**

```diff
--- a/index.js
-sequelizeDB1.sync()
-  .then(() => {
-    console.log('Database synced');
-    httpServer.listen(PORT, ...);
-  })
-  .catch(err => console.error('Unable to sync database:', err));
+sequelizeDB1.authenticate()
+  .then(() => httpServer.listen(PORT, () => logger.info({ port: PORT }, 'listening')))
+  .catch(err => { logger.fatal({ err }, 'database unreachable'); process.exit(1); });
```

Use `sequelize-cli` or `umzug` migrations, run as a deliberate deployment step under a **separate** DDL-capable account that the running application never uses. This separates "the app can read and write data" from "the app can restructure the database".

**Step 5 — enable TLS to the database.**

```js
dialectOptions: {
    ssl: { require: true, rejectUnauthorized: true, ca: fs.readFileSync(process.env.DB_CA_CERT) },
}
```

**Step 6 — remove the placeholder credentials** at `config/dbConfig.js:12-18`, or replace them with `process.env` references so no literal exists in a tracked file ([SEC-010](SEC-010-committed-third-party-credentials.md)).

**Step 7 — network isolation.** Bind MySQL to the private interface only; restrict access by security group or firewall to the application hosts. Verify it is not reachable from the public internet.

## Verification

1. **Privileges:** from the application's connection, `SHOW GRANTS FOR CURRENT_USER;` shows only DML on the one schema — no `FILE`, no `SUPER`, no `*.*`.
2. **FILE denied:** `SELECT LOAD_FILE('/etc/passwd');` returns `NULL` or an access-denied error.
3. **DDL denied:** `CREATE TABLE test_x (id INT);` fails.
4. **Password enforced:** `mysql -u root` with no password fails; the application refuses to boot with an empty `DB_PASSWORD1`.
5. **No sync:** `grep -n "sequelize.*\.sync(" index.js` returns nothing; schema changes arrive only through migrations.
6. **TLS:** `SHOW STATUS LIKE 'Ssl_cipher';` on the application's connection returns a non-empty cipher.
7. **Network:** from outside the application subnet, a connection to port 3306 is refused.

## References

- OWASP — [Database Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html)
- MySQL — [Securing the initial account](https://dev.mysql.com/doc/refman/8.0/en/default-privileges.html)
- OWASP ASVS 4.0.3 — V1.2 Authentication Architecture; V14.1 Build and Deploy
- CWE-250 — [Execution with Unnecessary Privileges](https://cwe.mitre.org/data/definitions/250.html)
