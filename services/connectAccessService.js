const crypto = require('crypto');
const ConnectAccessCode = require('../models/connectAccessCode');
const AppointmentService = require('./appointmentService');

// how long a generated connect access code can be used
const CONNECT_CODE_EXPIRY_SECONDS = 300;

class ConnectAccessService {
    // Creates a one time code for the connect-api, only the sha256 hash is stored.
    static async generateCode(patientId) {
        const code = crypto.randomBytes(32).toString('hex');
        const codeHash = crypto.createHash('sha256').update(code).digest('hex');
        const expiresAt = new Date(Date.now() + CONNECT_CODE_EXPIRY_SECONDS * 1000);
        await ConnectAccessCode.create({ codeHash, patientId, expiresAt });
        return { code, expiresIn: CONNECT_CODE_EXPIRY_SECONDS };
    }

    // A code is valid only for the patient it was made for, only once and only before it expires.
    static async verifyCode(patientId, code) {
        const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex');
        const connectCode = await ConnectAccessCode.findOne({ where: { codeHash, patientId } });
        if (!connectCode || connectCode.usedAt || new Date(connectCode.expiresAt) < new Date()) {
            return false;
        }
        // the usedAt check stops the same code being used by two requests at once
        const [updatedRows] = await ConnectAccessCode.update({ usedAt: new Date() }, { where: { id: connectCode.id, usedAt: null } });
        return updatedRows === 1;
    }

    // connect-api access token, called only after the code is verified
    static async getConnectToken(patientId) {
        return AppointmentService.getConnectToken(patientId);
    }
}

module.exports = ConnectAccessService;
