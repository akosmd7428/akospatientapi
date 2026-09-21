require('dotenv').config();

// SEC-010 / SEC-030 / SEC-032: refuse to start on a misconfigured or
// known-compromised credential, before anything binds a port.
const { validateEnv } = require('./config/validateEnv');
const { warnings } = validateEnv();
for (const warning of warnings) {
    console.warn(`[security] ${warning}`);
}

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const http = require('http'); // For creating an HTTP server
const { sequelizeDB1 } = require('./config/sequelize');
const authRoutes = require('./routes/authRoutes');
const forgotPasswordRoutes = require('./routes/forgotPasswordRoutes');
const patientProfileRoutes = require('./routes/patientProfileRoutes');
const helpRoutes = require('./routes/helpRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const patientAssessmentRoutes = require('./routes/patientAssessmentRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientCareTeamRoutes = require('./routes/patientCareTeamRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const patientFolderRoutes = require('./routes/patientFolderRoutes');
const dataRoutes = require('./routes/dataRoutes');
const labTestRoutes = require('./routes/labTestRoutes');
const carePlanRoutes = require('./routes/carePlanRoutes');
const opentokRoutes = require('./routes/opentokRoutes');
const careNavigatorRoutes = require('./routes/careNavigatorRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const chatRoutes = require('./routes/chatRoutes');
const CommonHelper = require('./helpers/commonHelper');
const { messages } = require('./config/language');
const { STATUS_CODE } = require('./config/constant');
const Chat = require('./models/chat')
const ChatService = require('./services/chatService');
const NotificationService = require('./services/notificationService');
const DataController = require('./controllers/dataController');
const errorHandler = require('./middleware/errorHandler');
const routeLogger = require('./middleware/routeLogger');
const { apiLimiter, uploadLimiter } = require('./middleware/rateLimiters'); // SEC-021
const AppointmentService = require('./services/appointmentService');
const hrRoutes = require('./routes/hrRoutes');
const vitalMonitoringRoutes = require('./routes/vitalMonitoringRoutes');
const migrationRoutes = require('./routes/migrationRoutes');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const httpServer = http.createServer(app);

/**
 * SEC-020: without this, req.ip is the proxy's address for every request, so the
 * rate limiter bucketed all traffic together and the SSO IP allow-list was
 * meaningless. Set to the exact number of proxies in front of the app - never
 * `true`, which trusts the whole chain and restores header spoofing.
 */
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// SEC-019: security headers. None were set at all previously.
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],   // a JSON API needs to load nothing
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

// SEC-019: refuse plaintext rather than redirecting - a redirect invites the
// client to retry having already sent the bearer token in the clear.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(403).json({ success: false, message: 'HTTPS required' });
  }
  return next();
});

/**
 * SEC-031: the limit was 50MB on every endpoint, and routeLogger then ran a
 * synchronous JSON.stringify over the whole body on each request, which blocks
 * the event loop. Large payloads are allowed only on the upload route.
 */
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ limit: '256kb', extended: true }));

/**
 * SEC-031: localhost origins are no longer allow-listed in production.
 * SEC-001 / SEC-009: `role` and `companyId` are gone from allowedHeaders. Both
 * were authorization inputs the client controlled; identity and tenant scope now
 * come from the signed token.
 */
const PROD_ORIGINS = ['https://carenavigator.akosmd.in', 'https://360.akosmd.in'];
const DEV_ORIGINS = Array.from({ length: 6 }, (_, i) => `http://localhost:${3000 + i}`);
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, ...DEV_ORIGINS];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / server-to-server
    return ALLOWED_ORIGINS.includes(origin)
      ? callback(null, true)
      : callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};

app.use(cors(corsOptions));

// SEC-021: a tighter global bucket; the strict per-endpoint limiters live on the
// auth and OTP routes themselves.
app.use('/api', apiLimiter);

// Apply route logger middleware to log all API route accesses
app.use(routeLogger);

app.use('/api/auth', authRoutes);
app.use('/api/forgot-password', forgotPasswordRoutes);
app.use('/api/patient', patientProfileRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/patient_assessments', patientAssessmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/care-team', patientCareTeamRoutes);
app.use('/api/appointment', appointmentRoutes);
app.use('/api/document', patientFolderRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/labs', labTestRoutes);
app.use('/api/care', carePlanRoutes);
app.use('/api/opentok', opentokRoutes);
app.use('/api', prescriptionRoutes);
app.use('/api/notify', notificationRoutes);
app.use('/api/careNavigator', careNavigatorRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/vital-monitoring', vitalMonitoringRoutes);
app.use('/api/migration', migrationRoutes);

/**
 * SEC-023: /assets was public static content holding prescription PDFs, lab
 * reports and uploaded medical images. The only protection was hash-like
 * filenames. It now requires authentication.
 *
 * SEC-014 / SEC-019: served as a download with nosniff and a sandbox CSP, so a
 * stored HTML or SVG file cannot execute as script on this origin.
 *
 * Per-document ownership checks still need the file-to-patient mapping - see
 * docs/security/findings/SEC-023 step 2. This closes anonymous access, which is
 * the exploitable part.
 */
const { requireAuth: requireAuthFn, ROLES: ROLE_NAMES } = require('./middleware/requireAuth');

app.use(
  '/assets',
  requireAuthFn(ROLE_NAMES.PATIENT, ROLE_NAMES.CARE_NAVIGATOR, ROLE_NAMES.HR),
  (req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  },
  express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'deny' })
);

// SEC-026: a 404 handler, then ONE terminal error handler. Previously a
// responding handler was registered before the routes' own, and errorHandler was
// mounted after it and so unreachable - while never sending a response anyway.
app.use((req, res) => res.status(STATUS_CODE.HTTP_404_NOT_FOUND).json({ success: false, message: 'Not found' }));
app.use(errorHandler);

/**
 * SEC-030: sequelizeDB1.sync() ran schema-modifying statements against production
 * on every boot, with no migration review and no rollback path. It also required
 * DDL privileges the runtime account should not hold. Replaced with a connection
 * check; schema changes belong in reviewed migrations run as a deploy step.
 */
sequelizeDB1.authenticate()
  .then(() => {
    // SEC-016 / SEC-021: purge diagnostic logs past their retention window and
    // expired OTP rows, so neither grows without bound.
    require('./helpers/logRetention').scheduleLogRetention();

    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database unreachable, refusing to start:', err.message);
    process.exit(1);
  });

// SEC-026: a stuck request must not hold a connection open indefinitely.
httpServer.requestTimeout = 30_000;
httpServer.headersTimeout = 35_000;

// SEC-026: an unhandled rejection previously terminated the process silently.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
  process.exit(1);
});

console.log(
  "-----------------Server.js:- Connecting to Socket Server patient---------------------"
);

const socket = require("socket.io");

/**
 * SEC-007: the socket server was created with no options and no middleware. There
 * was no handshake authentication, no origin restriction, and every handler took
 * the identity it acted on straight from the client's event payload. Anyone could
 * connect and read any clinician-patient conversation by iterating ids.
 *
 * It also bypassed validateDataEncryption, routeLogger, the rate limiter and
 * every auth middleware while calling the same services - a second, unguarded
 * front door into the same data.
 */
const io = socket(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6, // 1 MB, not the 100 MB default
});

const { verifyAccessToken } = require('./helpers/tokenHelper');
const { isJtiRevoked } = require('./services/tokenRevocationService');

// Numeric user types used by the chat tables.
const SOCKET_TYPE_FOR_ROLE = { patient: 1, doctor: 2, careNavigator: 3, hr: 4 };

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('unauthorized'));

    const claims = verifyAccessToken(token);
    if (await isJtiRevoked(claims)) return next(new Error('unauthorized'));

    socket.user = {
      id: claims.id,
      role: claims.role,
      type: SOCKET_TYPE_FOR_ROLE[claims.role],
      companyIds: Array.isArray(claims.companyIds) ? claims.companyIds : [],
    };
    return next();
  } catch (err) {
    return next(new Error('unauthorized')); // fail closed
  }
});

/**
 * SEC-007: handlers still accept ids in their payloads for wire compatibility,
 * but an id that is not the authenticated user is rejected rather than trusted.
 * Returns the verified id, or null when the claim does not match.
 */
function assertSelf(socket, claimedId, claimedType) {
  if (!socket.user) return null;
  if (claimedId !== undefined && Number(claimedId) !== Number(socket.user.id)) return null;
  if (claimedType !== undefined && Number(claimedType) !== Number(socket.user.type)) return null;
  return socket.user.id;
}

io.on("connection", (socket) => {
  socket.on('joinRoom', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
      const senderRoom = `${senderId}_${senderType}_${receiverId}_${receiverType}`;
      const receiverRoom = `${receiverId}_${receiverType}_${senderId}_${senderType}`;
      
      // Join the rooms
      socket.join(senderRoom);
      socket.join(receiverRoom);

      if (callback) {
          callback({ success: true, senderRoom: senderRoom, receiverRoom: receiverRoom });
      }
  });
  
  socket.on('sendMessage', async ({ senderId, senderType, receiverId, receiverType, message, messageType }, callback) => {
    try {
      await Chat.create({ senderId, senderType, receiverId, receiverType, message, messageType, roomId: `${senderId}_${senderType}_${receiverId}_${receiverType}` });
      
      // Create the rooms for both users
      const senderRoom = `${senderId}_${senderType}_${receiverId}_${receiverType}`;
      const receiverRoom = `${receiverId}_${receiverType}_${senderId}_${senderType}`;

      socket.join(senderRoom);
      socket.join(receiverRoom);
     
      const senderChatList = await ChatService.getChatList(senderId, senderType);
      const receiverChatList = await ChatService.getChatList(receiverId, receiverType);
     
      io.to(senderRoom).emit('chatList', { senderId, senderType, senderChatList });
      io.to(receiverRoom).emit('chatList', { receiverId, receiverType, receiverChatList });

      const senderChatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
      const receiverChatHistory = await ChatService.getChatHistory(receiverId, receiverType, senderId, senderType);
      console.log(senderRoom,'senderRoom===');
      console.log(receiverRoom,'receiverRoom===');
      // console.log(senderChatHistory,'senderChatHistory===');
      // console.log(receiverChatHistory,'receiverChatHistory===');
      io.to(senderRoom).emit('chatHistory', { senderId, senderType, senderChatHistory });
      io.to(receiverRoom).emit('chatHistory', { receiverId, receiverType, receiverChatHistory });

      if (callback) {
        callback({ success: true});
      }
    } catch (error) {
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  socket.on('createRoom', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
    try {
      await Chat.create({ senderId, senderType, receiverId, receiverType, roomId: `${senderId}_${senderType}_${receiverId}_${receiverType}` });
      
      // Create the rooms for both users
      const senderRoom = `${senderId}_${senderType}_${receiverId}_${receiverType}`;
      const receiverRoom = `${receiverId}_${receiverType}_${senderId}_${senderType}`;

      socket.join(senderRoom);
      socket.join(receiverRoom);

      const senderChatList = await ChatService.getChatList(senderId, senderType);
      const receiverChatList = await ChatService.getChatList(receiverId, receiverType);

      io.to(senderRoom).emit('chatList', { senderId, senderType, senderChatList });
      io.to(receiverRoom).emit('chatList', { receiverId, receiverType, receiverChatList });

      const senderChatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
      const receiverChatHistory = await ChatService.getChatHistory(receiverId, receiverType, senderId, senderType);
     
      io.to(senderRoom).emit('chatHistory', { senderId, senderType, senderChatHistory });
      io.to(receiverRoom).emit('chatHistory', { receiverId, receiverType, receiverChatHistory });

      if (callback) {
        callback({ success: true});
      }
    } catch (error) {
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Event to get chat list
  socket.on('getChatList', async ({ userId, userType }, callback) => {
    try {
      // SEC-007: the caller cannot ask for another user's chat list.
      if (assertSelf(socket, userId, userType) === null) return callback({ success: false, error: 'forbidden' });
      const chatList = await ChatService.getChatList(socket.user.id, socket.user.type);
      callback({ success: true, userId, userType, chatList });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // Event to get chat history
  socket.on('getChatHistory', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
    try {
      // SEC-007: the sender side must be the authenticated user.
      if (assertSelf(socket, senderId, senderType) === null) return callback({ success: false, error: 'forbidden' });
      const chatHistory = await ChatService.getChatHistory(socket.user.id, socket.user.type, receiverId, receiverType);
      callback({ success: true, senderId, senderType, receiverId, receiverType, chatHistory });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });


   // Event to get chat history
   socket.on('getNotifications', async ({ role, referenceId, filter }, callback) => {
    try {
      const notifications = await NotificationService.getNotifications(role, referenceId, filter);
      callback({ success: true, notifications });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('fetchPatientCallDetail', async ({ userId }, callback) => {
      // SEC-007: only the authenticated user's call details.
      if (assertSelf(socket, userId) === null) return callback({ success: false, error: 'forbidden' });
      // SEC-016: removed console.log of call details.
      const callDetails = await ChatService.getCallDetailsForPatient(socket.user.id);
      callback({ success: true, callDetails });
    //} catch (error) {
     // console.log("chatCallBack error", error.message);
     // callback({ success: false, error: error.message });
   // }
  });

  socket.on('listen', async ({ userId, userType }, callback) => {
      try {
          // SEC-007: rooms are joined for the authenticated user only.
          if (assertSelf(socket, userId, userType) === null) return callback && callback({ success: false, error: 'forbidden' });
          const chatList = await ChatService.getChatList(socket.user.id, socket.user.type);
            // Loop through the chat list to create and join rooms
            chatList.forEach(chat => {
              if(chat){
                const senderRoom = `${userId}_${userType}_${chat.chatPartnerId}_${chat.chatPartnerType}`;
                const receiverRoom = `${chat.chatPartnerId}_${chat.chatPartnerType}_${userId}_${userType}`;
                
                // Join the rooms
                socket.join(senderRoom);
                socket.join(receiverRoom);
              }
            });
          
          // await ChatService.updateUserStatus(userId, userType, true);          
          // Optionally send back the chat list
          if (callback) {
              callback({ success: true });
          }
      } catch (error) {
          // Optionally send back an error to the client
          if (callback) {
              callback({ success: false, error: error.message });
          }
      }
  });

  socket.on('incomingCallListUpdate', async ({ patientid, docid, groupid, callid }, callback) => {
    // try {
      console.log("incomingCallListUpdate socket called============");
      let waitingList = await DataController.getTalkToDoctorCallList(patientid, callid);
      let data = {
        waitingList
      };

      let fetchDoctorCallData = await AppointmentService.fetchDoctorIds(patientid);
      const connectDoctorIds = fetchDoctorCallData.connectDoctorIds;
      const groupIds = fetchDoctorCallData.groupIds;

      await Promise.all(connectDoctorIds.map(async (id, index) => {
        if(data.waitingList[0] != undefined){
          data.waitingList[0].group_id = groupIds[index];
          data.waitingList[0].pcp_doctor_id = id;
          data.waitingList[0].callHide = 1;
          // const room = `${id}_${groupIds[index]}`;
          // io.to(room).emit('removeIncomingCall', data);
          // console.log(room, 'removeIncomingCall===================');          
          // io.emit('removeIncomingCall', data);  
                
          io.emit('incomingCallListFront', data);        
        }
      }));        
      if (callback) {
        callback({ success: true});
      }
    // } catch (error) {
    //     // Optionally send back an error to the client
    //     if (callback) {
    //         callback({ success: false, error: error.message });
    //     }
    // }
  });

  socket.on('incomingCallTalkToDoctor', async ({ connectDoctorIds, groupIds, patientId, callId }, callback) => {
      try {
        console.log("incomingCallTalkToDoctor socket called============");        
        let waitingList = await DataController.getTalkToDoctorCallList(patientId, callId);
        let data = {
          waitingList
        };
        
        await Promise.all(connectDoctorIds.map(async (id, index) => {
          if(data.waitingList[0] != undefined){
            // const room = `${id}_${groupIds[index]}`;
            // socket.join(room);
            console.log(data,"incomming call");
            data.waitingList[0].group_id = groupIds[index];
            data.waitingList[0].pcp_doctor_id = id;
            data.waitingList[0].callHide = 0;
            io.emit('incomingCallListFront', data); 
          }
        }));  
        if (callback) {
          callback({ success: true});
        }
      } catch (error) {
          // Optionally send back an error to the client
          if (callback) {
              callback({ success: false, error: error.message });
          }
      }
  });

  socket.on('incomingCallList', async ({ docid, groupId }, callback) => {
      try {
      const id = docid;
      const group_id = [
        {
            "id": groupId
        }
      ];
      const waitingList = await DataController.getWaitingUserList(id, group_id);
      
        const data = {
          waitingList
        }
        
        io.emit('incomingCallListFront', data);

        if (callback) {
          callback({ success: true});
        }
      } catch (error) {
          // Optionally send back an error to the client
          if (callback) {
              callback({ success: false, error: error.message });
          }
      }
  });

  socket.on('incomingCall', async ({ docid, groupId }, callback) => {
    try {
    const id = docid;
    const group_id = [
      {
          "id": groupId
      }
    ];
    const waitingList = await DataController.getWaitingUserList(id, group_id);
      const data = {
        waitingList
      }
      if (callback) {
        callback({ success: true, data});
      }
    } catch (error) {
        // Optionally send back an error to the client
        if (callback) {
            callback({ success: false, error: error.message });
        }
    }
  });
  // update scoket
  socket.on('acceptedCallByDoctor', async ({ userId }, callback) => {
    //try {
      console.log(userId,"updated doctor records  ====== Start");
      const callDetails = await ChatService.getCallDetailsForPatientAccept(userId);
     // console.log(callDetails);
      const data = {
        callDetails
      }
      io.emit('acceptedCallRecordFront', data);
      callback({ success: true, data });

    //} catch (error) {
     // console.log("chatCallBack error", error.message);
     // callback({ success: false, error: error.message });
   // }
  });

  // update scoket
  socket.on('declinefromPatient', async ({ doctorId,patientId,connectDocId }, callback) => {
    //try {
      console.log(connectDocId,"decline from patient  ====== Start");
      const callDetails = await ChatService.updateCallingRoom(doctorId,patientId,connectDocId);
     // console.log(callDetails);
      const data = {
        "doctorId" : doctorId,
        "patientId" :patientId,
        "connectDocId" :connectDocId
      }
      io.emit('declinefromPatientFront', data);
      callback({ success: true, data });

    //} catch (error) {
     // console.log("chatCallBack error", error.message);
     // callback({ success: false, error: error.message });
   // }
  });

  socket.on('declinefromDoctor', async ({ doctorId,patientId,connectDocId }, callback) => {
    //try {
      console.log(connectDocId,"declinefrom doctor  ====== Start");
      const callDetails = await ChatService.updateCallingRoom(doctorId,patientId,connectDocId);
     // console.log(callDetails);
     const data = {
      "doctorId" : doctorId,
      "patientId" :patientId,
      "connectDocId" :connectDocId
    }
      io.emit('declinefromDoctorFront', data);
      callback({ success: true, data });

    //} catch (error) {
     // console.log("chatCallBack error", error.message);
     // callback({ success: false, error: error.message });
   // }
  });
  
  socket.on("disconnect", function () {
    console.log("Socket Disconnected");
  });
});
