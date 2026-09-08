const OpenTok = require('opentok');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// Initialize OpenTok
const opentok = new OpenTok(API_KEY, API_SECRET);

const createSession = () => {
  return new Promise((resolve, reject) => {
    opentok.createSession(
      { mediaMode: 'routed', archiveMode: 'manual' }, (error, session) => {
        console.log(error,'error====');
      if (error) {
        return reject(error);
      }
      resolve(session.sessionId);
    });
  });
};

const generateToken = (sessionId, role = 'moderator', data = 'doctorId=61') => {
  // const tokenOptions = {
  //   role: role,
  //   data: data
  // };
  // return opentok.generateToken(sessionId, tokenOptions);
    return opentok.generateToken(sessionId);
};

module.exports = {
  createSession,
  generateToken
};
