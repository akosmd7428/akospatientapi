const DataController = require('../controllers/dataController');
const AppointmentService = require('../services/appointmentService');
const ChatService = require('../services/chatService');

/*
 * Call events shared by the socket handlers (socket/index.js) and the ohc-sync api
 * (controllers/ohcSyncController.js), so a call started or declined from the OHC portal
 * reaches the doctors exactly like one started in the patient app.
 */

// the socket.io server, set once by socket/index.js when it starts
let ioServer = null;
const setIO = (io) => { ioServer = io; };
const getIO = () => {
  if (!ioServer) throw new Error('socket server is not initialised');
  return ioServer;
};

// room names, the same ones socket/index.js joins
const DOCTORS_ROOM = 'doctors';
const connectRoom = (connectDocId) => `connect:${connectDocId}`;

/**
 * Patient started a talk to doctor call: rings every doctor available for this patient.
 * Doctors come from the server, never from the client.
 * Returns the number of doctor rooms notified, or null when the patient has no active call with this id.
 */
const incomingCallTalkToDoctor = async (io, patientId, callId) => {
  const waitingList = await DataController.getTalkToDoctorCallList(patientId, callId);
  if (!waitingList || waitingList[0] === undefined) return null;
  const data = {
    waitingList
  };
  const { connectDoctorIds, groupIds } = await AppointmentService.fetchDoctorIds(patientId);

  connectDoctorIds.forEach((id, index) => {
    data.waitingList[0].group_id = groupIds[index];
    data.waitingList[0].pcp_doctor_id = id;
    data.waitingList[0].callHide = 0;
    // patient details only go to the doctor the call is offered to
    io.to(connectRoom(id)).emit('incomingCallListFront', data);
  });
  return connectDoctorIds.length;
};

/**
 * Patient declined / left the call: closes only that patient's waiting room rows
 * and tells the doctors. Returns the data that was emitted.
 */
const declinefromPatient = async (io, patientId, doctorId, connectDocId) => {
  await ChatService.updateCallingRoom(doctorId, patientId, connectDocId);
  const data = {
    "doctorId" : ChatService.toPositiveInt(doctorId),
    "patientId" : patientId,
    "connectDocId" : connectDocId
  };
  io.to(DOCTORS_ROOM).emit('declinefromPatientFront', data);
  return data;
};

module.exports = { setIO, getIO, DOCTORS_ROOM, connectRoom, incomingCallTalkToDoctor, declinefromPatient };
