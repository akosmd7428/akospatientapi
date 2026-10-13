const jwt = require('jsonwebtoken');
const Patient = require('../models/patientModel');
const crypto = require('crypto');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');

const INVALID_LOGIN = 'Invalid email or password';

// fields that must never leave the server with a user row
const SECRET_FIELDS = ['password', 'validate_token', 'client_secret'];

// role header -> model and numeric role used by the controller
const LOGIN_ROLES = {
  patient: { model: Patient, role: 1 },
  careNavigator: { model: CareNavigator, role: 2 },
  hr: { model: Hr, role: 3 },
};

// timing safe compare of two hex md5 hashes
const md5Equals = (hash, storedHash) => {
  const a = Buffer.from(String(hash));
  const b = Buffer.from(String(storedHash || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

class AuthService {
  static INVALID_LOGIN = INVALID_LOGIN;

  // plain copy of a user row without the password hash and other secrets
  static safeUser(user) {
    const plain = user && typeof user.get === 'function' ? user.get({ plain: true }) : { ...user };
    SECRET_FIELDS.forEach(field => delete plain[field]);
    return plain;
  }

  static async login(data) {
    const { email, password, getRole } = data;
    // the role comes from the header, only the three login roles are accepted
    const loginRole = Object.prototype.hasOwnProperty.call(LOGIN_ROLES, getRole) ? LOGIN_ROLES[getRole] : null;
    if (!loginRole || typeof email !== 'string' || typeof password !== 'string') {
      throw new Error(INVALID_LOGIN);
    }

    // Create the MD5 hash of the plaintext password (stored format is shared with other systems)
    const hash = crypto.createHash('md5').update(password).digest('hex');
    const user = await loginRole.model.findOne({ where: { email } });
    if (!user || !md5Equals(hash, user.password)) {
      throw new Error(INVALID_LOGIN);
    }
    // disabled or deleted staff accounts cannot log in
    if (getRole !== 'patient' && (user.isActive == 0 || user.isDeleted == 1)) {
      throw new Error(INVALID_LOGIN);
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: getRole }, process.env.JWT_SECRET, { expiresIn: '1d' });

    return { token, user, role: loginRole.role };
  }

  static async patientLogin(patient) {
    const token = jwt.sign({ id: patient.id, email: patient.email, role:"patient" }, process.env.JWT_SECRET, { expiresIn: '1d' });

    return { token };
  }
  
  
}

module.exports = AuthService;
