const Chat = require('../models/chat');
const ChatService = require('../services/chatService');
const NotificationService = require('../services/notificationService');
const DataController = require('../controllers/dataController');
const AppointmentService = require('../services/appointmentService');
const { verifyLoginToken, ROLES } = require('../middleware/authorize');
const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const CallEvents = require('./callEvents');
const { verifyOhcCallToken } = require('./ohcCallToken');

const { USER_TYPE, toPositiveInt } = ChatService;

// chat user type of each login role, hr only uses notifications
const ROLE_USER_TYPE = {
  [ROLES.PATIENT]: USER_TYPE.PATIENT,
  [ROLES.DOCTOR]: USER_TYPE.DOCTOR,
  [ROLES.CARE_NAVIGATOR]: USER_TYPE.CARE_NAVIGATOR,
};
const USER_TYPE_ROLE = {
  [USER_TYPE.PATIENT]: ROLES.PATIENT,
  [USER_TYPE.DOCTOR]: ROLES.DOCTOR,
  [USER_TYPE.CARE_NAVIGATOR]: ROLES.CARE_NAVIGATOR,
};
const SOCKET_ROLES = [ROLES.PATIENT, ROLES.DOCTOR, ROLES.CARE_NAVIGATOR, ROLES.HR];
const CHAT_ROLES = [ROLES.PATIENT, ROLES.DOCTOR, ROLES.CARE_NAVIGATOR];

// same origins as the express cors config in index.js
// localhost origins are only allowed outside production
const DEFAULT_CORS_ORIGINS = process.env.NODE_ENV === 'production'
  ? 'https://carenavigator.akosmd.in,https://360.akosmd.in,https://360-staging.akosmd.in,https://carenavigator-staging.akosmd.in,https://connect-portal-staging.akosmd.in,https://connect-portal.akosmd.in'
  : 'https://carenavigator.akosmd.in,https://360.akosmd.in,https://360-staging.akosmd.in,https://carenavigator-staging.akosmd.in,https://connect-portal-staging.akosmd.in,https://connect-portal.akosmd.in,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005';
// the ohc portal only uses the socket (talk to doctor calls), not the express apis;
// extra origins can be added with OHC_SOCKET_ORIGINS (comma separated)
const OHC_SOCKET_ORIGINS = process.env.OHC_SOCKET_ORIGINS || 'https://ohc.akosmd.in';
// a browser origin never ends with "/", a trailing "/" in the list is removed so the origin still matches
const CORS_ORIGINS = [process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS, OHC_SOCKET_ORIGINS].join(',').split(',').map(origin => origin.trim().replace(/\/+$/, '')).filter(Boolean);

const DENIED = { success: false, error: 'Access denied' };
const INVALID = { success: false, error: 'Invalid request' };
const FAILED = { success: false, error: 'Something went wrong' };

// personal room of a logged in user, every socket of that user joins it on connect
const userRoom = (role, id) => `user:${role}:${id}`;
// ohc portal socket of a patient's talk to doctor call: gets only the call events of that patient,
// never the patient's personal room (chat list / history pushes)
const ohcCallRoom = (patientId) => `ohc-call:patient:${patientId}`;
// what an ohc call socket may do, every other event is refused
const OHC_CALL_EVENTS = ['incomingCallTalkToDoctor', 'declinefromPatient', 'fetchPatientCallDetail'];
// doctors room and the room of one connect_provider id (every socket of the doctor owning it
// joins on connect) are defined in callEvents, the ohc-sync api emits to the same rooms
const { DOCTORS_ROOM, connectRoom } = CallEvents;

// chat abuse limits
const MAX_MESSAGE_LENGTH = 5000;
const MESSAGE_RATE_LIMIT = 20;
const MESSAGE_RATE_WINDOW_MS = 10 * 1000;
// longest delay setTimeout accepts, longer token lifetimes are re-checked
const MAX_TIMER_MS = 2147483647;
const chatRoom = (aId, aType, bId, bType) => `${aId}_${aType}_${bId}_${bType}`;

// connect_provider ids of a doctor, doctorportalapi links them by doctor id or by the login email
const getDoctorConnectIds = async (user) => {
  const rows = await sequelizeDB1.query(
    'SELECT id FROM connect_provider WHERE doctor_id = :doctorId OR (email = :email AND :email <> \'\')',
    { replacements: { doctorId: user.id, email: user.email || '' }, type: QueryTypes.SELECT }
  );
  return rows.map(row => Number(row.id));
};

const doctorOwnsConnectId = async (user, connectDocId) => {
  const id = toPositiveInt(connectDocId);
  if (!id) return false;
  return (await getDoctorConnectIds(user)).includes(id);
};

const connectIdInGroup = async (connectDocId, groupId) => {
  if (groupId === 0) return true;
  const [row] = await sequelizeDB1.query(
    'SELECT 1 AS found FROM connect_provider_groups WHERE connect_provider_id = :connectDocId AND group_id = :groupId LIMIT 1',
    { replacements: { connectDocId, groupId }, type: QueryTypes.SELECT }
  );
  return !!row;
};

const toGroupId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : null;
};

module.exports = (httpServer) => {
const socket = require("socket.io");
const io = socket(httpServer, {
  cors: { origin: CORS_ORIGINS },
  // cors only covers polling, websocket upgrades from other browser origins are refused here
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const allowed = !origin || CORS_ORIGINS.includes(origin);
    // a refused websocket upgrade reaches the browser only as "Unexpected response code: 400", add the origin to CORS_ORIGINS
    if (!allowed) console.warn('socket origin not allowed:', origin);
    callback(null, allowed);
  },
  // events only carry text and ids, chat files go through the http upload
  maxHttpBufferSize: 1e5,
});
// lets the http apis (ohc-sync) emit to the same rooms
CallEvents.setIO(io);

// every socket must present a login token: io(url, { auth: { token } }),
// or an ohc call token from /ohc-sync/socket-token (patient of the ohc company, call events only)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const decoded = verifyLoginToken(token, SOCKET_ROLES);
  const id = decoded ? toPositiveInt(decoded.id) : null;
  if (decoded && id) {
    socket.data.user = { id, role: decoded.role, userType: ROLE_USER_TYPE[decoded.role] || null, email: decoded.email };
    socket.data.tokenExp = Number(decoded.exp) || null;
    return next();
  }
  const ohcCall = verifyOhcCallToken(token);
  if (ohcCall) {
    socket.data.user = { id: Number(ohcCall.id), role: ROLES.PATIENT, userType: USER_TYPE.PATIENT, email: undefined };
    socket.data.ohcCall = true;
    socket.data.tokenExp = ohcCall.exp;
    return next();
  }
  return next(new Error('unauthorized'));
});

io.on("connection", (socket) => {
  const me = socket.data.user;
  socket.join(socket.data.ohcCall ? ohcCallRoom(me.id) : userRoom(me.role, me.id));
  if (me.role === ROLES.DOCTOR) {
    socket.join(DOCTORS_ROOM);
    // call events only go to the doctor's own connect provider rooms
    getDoctorConnectIds(me)
      .then(ids => ids.forEach(connectId => socket.join(connectRoom(connectId))))
      .catch(error => console.error('socket connect rooms error:', error));
  }

  // drop the socket when the login token expires
  let expiryTimer = null;
  const scheduleExpiry = () => {
    if (!socket.data.tokenExp) return;
    const delay = socket.data.tokenExp * 1000 - Date.now();
    if (delay <= 0) return socket.disconnect(true);
    expiryTimer = setTimeout(scheduleExpiry, Math.min(delay, MAX_TIMER_MS));
  };
  scheduleExpiry();

  // per socket message rate limit
  let messageTimes = [];
  const isRateLimited = () => {
    const now = Date.now();
    messageTimes = messageTimes.filter(time => now - time < MESSAGE_RATE_WINDOW_MS);
    if (messageTimes.length >= MESSAGE_RATE_LIMIT) return true;
    messageTimes.push(now);
    return false;
  };

  // registers a handler limited to the given roles, with a safe callback and no error details to the client
  const on = (event, roles, handler) => {
    socket.on(event, async (payload, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};
      if (!roles.includes(me.role) || (socket.data.ohcCall && !OHC_CALL_EVENTS.includes(event))) {
        return reply(DENIED);
      }
      try {
        await handler(payload && typeof payload === 'object' ? payload : {}, reply);
      } catch (error) {
        console.error(`socket ${event} error:`, error);
        reply(FAILED);
      }
    });
  };

  const parseReceiver = (receiverId, receiverType) => {
    const id = toPositiveInt(receiverId);
    const type = toPositiveInt(receiverType);
    if (!id || !USER_TYPE_ROLE[type]) return null;
    return { id, type };
  };

  // chat list and history go to the personal rooms of both users, never to the other side
  const emitChatUpdates = async (to) => {
    const senderId = me.id;
    const senderType = me.userType;
    const receiverId = to.id;
    const receiverType = to.type;
    const senderRoom = userRoom(me.role, senderId);
    const receiverRoom = userRoom(USER_TYPE_ROLE[receiverType], receiverId);

    const senderChatList = await ChatService.getChatList(senderId, senderType);
    const receiverChatList = await ChatService.getChatList(receiverId, receiverType);

    io.to(senderRoom).emit('chatList', { senderId, senderType, senderChatList });
    io.to(receiverRoom).emit('chatList', { receiverId, receiverType, receiverChatList });

    const senderChatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
    const receiverChatHistory = await ChatService.getChatHistory(receiverId, receiverType, senderId, senderType);

    io.to(senderRoom).emit('chatHistory', { senderId, senderType, senderChatHistory });
    io.to(receiverRoom).emit('chatHistory', { receiverId, receiverType, receiverChatHistory });
  };

  on('joinRoom', CHAT_ROLES, async ({ receiverId, receiverType }, reply) => {
    const to = parseReceiver(receiverId, receiverType);
    if (!to) return reply(INVALID);
    if (!await ChatService.canChat(me.id, me.userType, to.id, to.type)) return reply(DENIED);

    const senderRoom = chatRoom(me.id, me.userType, to.id, to.type);
    const receiverRoom = chatRoom(to.id, to.type, me.id, me.userType);

    // Join the rooms
    socket.join(senderRoom);
    socket.join(receiverRoom);

    reply({ success: true, senderRoom: senderRoom, receiverRoom: receiverRoom });
  });

  on('sendMessage', CHAT_ROLES, async ({ receiverId, receiverType, message, messageType }, reply) => {
    const to = parseReceiver(receiverId, receiverType);
    if (!to || typeof message !== 'string') return reply(INVALID);
    if (message.length > MAX_MESSAGE_LENGTH || !ChatService.isValidMessageType(messageType)) return reply(INVALID);
    if (isRateLimited()) return reply({ success: false, error: 'Too many messages' });
    if (!await ChatService.canChat(me.id, me.userType, to.id, to.type)) return reply(DENIED);

    const senderRoom = chatRoom(me.id, me.userType, to.id, to.type);
    const receiverRoom = chatRoom(to.id, to.type, me.id, me.userType);
    await Chat.create({ senderId: me.id, senderType: me.userType, receiverId: to.id, receiverType: to.type, message, messageType, roomId: senderRoom });

    socket.join(senderRoom);
    socket.join(receiverRoom);

    await emitChatUpdates(to);
    reply({ success: true });
  });

  on('createRoom', CHAT_ROLES, async ({ receiverId, receiverType }, reply) => {
    const to = parseReceiver(receiverId, receiverType);
    if (!to) return reply(INVALID);
    // createRoom also inserts a chat row, shares the message rate limit
    if (isRateLimited()) return reply({ success: false, error: 'Too many messages' });
    if (!await ChatService.canChat(me.id, me.userType, to.id, to.type)) return reply(DENIED);

    const senderRoom = chatRoom(me.id, me.userType, to.id, to.type);
    const receiverRoom = chatRoom(to.id, to.type, me.id, me.userType);
    await Chat.create({ senderId: me.id, senderType: me.userType, receiverId: to.id, receiverType: to.type, roomId: senderRoom });

    socket.join(senderRoom);
    socket.join(receiverRoom);

    await emitChatUpdates(to);
    reply({ success: true });
  });

  // Event to get chat list
  on('getChatList', CHAT_ROLES, async (payload, reply) => {
    const chatList = await ChatService.getChatList(me.id, me.userType);
    reply({ success: true, userId: me.id, userType: me.userType, chatList });
  });

  // Event to get chat history, only the caller's own conversations
  on('getChatHistory', CHAT_ROLES, async ({ receiverId, receiverType }, reply) => {
    const to = parseReceiver(receiverId, receiverType);
    if (!to) return reply(INVALID);
    const chatHistory = await ChatService.getChatHistory(me.id, me.userType, to.id, to.type);
    reply({ success: true, senderId: me.id, senderType: me.userType, receiverId: to.id, receiverType: to.type, chatHistory });
  });

  // notifications of the logged in user, client role/referenceId are ignored
  on('getNotifications', SOCKET_ROLES, async ({ filter }, reply) => {
    const notifications = await NotificationService.getNotifications(me.role, me.id, typeof filter === 'string' ? filter : undefined);
    reply({ success: true, notifications });
  });

  on('fetchPatientCallDetail', [ROLES.PATIENT], async (payload, reply) => {
    const callDetails = await ChatService.getCallDetailsForPatient(me.id);
    reply({ success: true, callDetails });
  });

  // joins the rooms of the caller's own conversations
  on('listen', CHAT_ROLES, async (payload, reply) => {
    const chatList = await ChatService.getChatList(me.id, me.userType);
    chatList.forEach(chat => {
      if (chat) {
        socket.join(chatRoom(me.id, me.userType, chat.chatPartnerId, chat.chatPartnerType));
        socket.join(chatRoom(chat.chatPartnerId, chat.chatPartnerType, me.id, me.userType));
      }
    });
    reply({ success: true });
  });

  // doctor accepted a call, hides it from the other doctors' incoming lists
  on('incomingCallListUpdate', [ROLES.DOCTOR], async ({ patientid, callid }, reply) => {
    const patientId = toPositiveInt(patientid);
    const callId = toPositiveInt(callid);
    if (!patientId || !callId) return reply(INVALID);

    const fetchDoctorCallData = await AppointmentService.fetchDoctorIds(patientId);
    const connectDoctorIds = fetchDoctorCallData.connectDoctorIds;
    const groupIds = fetchDoctorCallData.groupIds;
    // only a doctor the call was offered to can update it
    const ownConnectIds = await getDoctorConnectIds(me);
    if (!connectDoctorIds.some(id => ownConnectIds.includes(Number(id)))) return reply(DENIED);

    const waitingList = await DataController.getTalkToDoctorCallList(patientId, callId);
    const data = {
      waitingList
    };

    connectDoctorIds.forEach((id, index) => {
      if (data.waitingList[0] != undefined) {
        data.waitingList[0].group_id = groupIds[index];
        data.waitingList[0].pcp_doctor_id = id;
        data.waitingList[0].callHide = 1;
        // io.to(DOCTORS_ROOM).emit('incomingCallListFront', data);
        // patient details only go to the doctor the call was offered to
        io.to(connectRoom(id)).emit('incomingCallListFront', data);
      }
    });
    reply({ success: true });
  });

  // patient started a talk to doctor call, rings the doctors available for this patient
  on('incomingCallTalkToDoctor', [ROLES.PATIENT], async ({ callId }, reply) => {
    const call = toPositiveInt(callId);
    if (!call) return reply(INVALID);

    // same function as the ohc-sync api, doctors come from the server, client connectDoctorIds/groupIds are ignored
    await CallEvents.incomingCallTalkToDoctor(io, me.id, call);
    reply({ success: true });
  });

  // waiting list of the doctor's own connect provider id and group
  const getOwnWaitingList = async (docid, groupId) => {
    const connectDocId = toPositiveInt(docid);
    const group = toGroupId(groupId);
    if (!connectDocId || group === null) return null;
    if (!await doctorOwnsConnectId(me, connectDocId) || !await connectIdInGroup(connectDocId, group)) return null;
    return DataController.getWaitingUserList(connectDocId, [{ id: group }]);
  };

  on('incomingCallList', [ROLES.DOCTOR], async ({ docid, groupId }, reply) => {
    const waitingList = await getOwnWaitingList(docid, groupId);
    if (!waitingList) return reply(DENIED);
    const data = {
      waitingList
    };
    // io.to(DOCTORS_ROOM).emit('incomingCallListFront', data);
    // the waiting list only goes to the requesting doctor's connect provider room
    io.to(connectRoom(toPositiveInt(docid))).emit('incomingCallListFront', data);
    reply({ success: true });
  });

  on('incomingCall', [ROLES.DOCTOR], async ({ docid, groupId }, reply) => {
    const waitingList = await getOwnWaitingList(docid, groupId);
    if (!waitingList) return reply(DENIED);
    const data = {
      waitingList
    };
    reply({ success: true, data });
  });

  // doctor accepted the patient's call, tells that patient who picked it up
  on('acceptedCallByDoctor', [ROLES.DOCTOR], async ({ userId }, reply) => {
    const patientId = toPositiveInt(userId);
    if (!patientId) return reply(INVALID);
    const callDetails = await ChatService.getCallDetailsForPatientAccept(patientId);
    if (!callDetails) return reply(INVALID);
    const ownConnectIds = await getDoctorConnectIds(me);
    if (Number(callDetails.doctor_id) !== me.id && !ownConnectIds.includes(Number(callDetails.connected_doctorId))) {
      return reply(DENIED);
    }
    const data = {
      callDetails
    };
    // the patient app, and the ohc portal when the call was made from there
    io.to(userRoom(ROLES.PATIENT, patientId)).to(ohcCallRoom(patientId)).emit('acceptedCallRecordFront', data);
    reply({ success: true, data });
  });

  on('declinefromPatient', [ROLES.PATIENT], async ({ doctorId, connectDocId }, reply) => {
    const connectId = toPositiveInt(connectDocId);
    if (!connectId) return reply(INVALID);
    // only the patient's own waiting room rows are closed, same function as the ohc-sync api
    const data = await CallEvents.declinefromPatient(io, me.id, doctorId, connectId);
    reply({ success: true, data });
  });

  on('declinefromDoctor', [ROLES.DOCTOR], async ({ patientId, connectDocId }, reply) => {
    const patient = toPositiveInt(patientId);
    const connectId = toPositiveInt(connectDocId);
    if (!patient || !connectId) return reply(INVALID);
    if (!await doctorOwnsConnectId(me, connectId)) return reply(DENIED);
    await ChatService.updateCallingRoom(me.id, patient, connectId);
    const data = {
      "doctorId" : me.id,
      "patientId" : patient,
      "connectDocId" : connectId
    };
    io.to(userRoom(ROLES.PATIENT, patient)).to(ohcCallRoom(patient)).emit('declinefromDoctorFront', data);
    reply({ success: true, data });
  });

  socket.on("disconnect", function () {
    clearTimeout(expiryTimer);
    console.log("Socket Disconnected");
  });
});

  return io;
};
