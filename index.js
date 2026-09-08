require('dotenv').config();
const express = require('express');
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
const rateLimit = require('express-rate-limit');
const AppointmentService = require('./services/appointmentService');
const hrRoutes = require('./routes/hrRoutes');
const vitalMonitoringRoutes = require('./routes/vitalMonitoringRoutes');
const migrationRoutes = require('./routes/migrationRoutes');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const httpServer = http.createServer(app);

app.use(express.json({ limit: '50mb' })); // Increase the limit to 50MB or as needed
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Use the cors middleware with specific options
const corsOptions = {
  // origin: "*",
  origin: ["https://carenavigator.akosmd.in", "https://360.akosmd.in","http://localhost:3000","http://localhost:3001","http://localhost:3002","http://localhost:3003","http://localhost:3004", "http://localhost:3005"],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization','role','companyId'],
};

app.use(cors(corsOptions));

// Define the rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 1000, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply to all API routes
app.use('/api', apiLimiter);

// Parse JSON bodies
app.use(express.json());
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

// Error handling middleware
app.use((err, req, res, next) => {
  CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, err.message);
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Error handling middleware (always at the end)
app.use(errorHandler);

sequelizeDB1.sync()
  .then(() => {
    console.log('Database synced');
    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => console.error('Unable to sync database:', err));

console.log(
  "-----------------Server.js:- Connecting to Socket Server patient---------------------"
);

const socket = require("socket.io");
const io = socket(httpServer);

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
      const chatList = await ChatService.getChatList(userId, userType);
      callback({ success: true, userId, userType, chatList });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // Event to get chat history
  socket.on('getChatHistory', async ({ senderId, senderType, receiverId, receiverType }, callback) => {
    try {
      const chatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
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
    //try {
      console.log("chatCallBack Start");
      const callDetails = await ChatService.getCallDetailsForPatient(userId);
      console.log(callDetails);
      callback({ success: true, callDetails });
    //} catch (error) {
     // console.log("chatCallBack error", error.message);
     // callback({ success: false, error: error.message });
   // }
  });

  socket.on('listen', async ({ userId, userType }, callback) => {
      try {
          // Fetch the user's chat list
          const chatList = await ChatService.getChatList(userId, userType);
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
