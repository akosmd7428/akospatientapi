const crypto = require('crypto');

// in-memory store, one entry per email: { otp, role, expirationTime, attempts, sentAt, verifiedUntil }
const otpMap = new Map();
const OTP_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the otp is thrown away
const RESEND_COOLDOWN = 30 * 1000; // matches the resend timer of the frontends
const RESET_WINDOW = 10 * 60 * 1000; // time to set the new password after the otp is verified

const otpKey = (email) => String(email || '').trim().toLowerCase();

// false when an otp was sent to this email moments ago, stops email flooding
const canSendOtp = (email) => {
  const otpData = otpMap.get(otpKey(email));
  return !otpData || !otpData.sentAt || Date.now() - otpData.sentAt >= RESEND_COOLDOWN;
};

const generateOtp = (email, role) => {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();
  otpMap.set(otpKey(email), { otp, role, expirationTime: now + OTP_EXPIRATION_TIME, attempts: 0, sentAt: now, verifiedUntil: 0 });
  return otp;
};

const validateOtp = (email, otp) => {
  const key = otpKey(email);
  const otpData = otpMap.get(key);
  if (!otpData || !otpData.otp) return false;
  
  if (Date.now() > otpData.expirationTime) {
    otpMap.delete(key); // Remove expired OTP
    return false;
  }

  otpData.attempts += 1;
  if (otpData.attempts > MAX_OTP_ATTEMPTS) {
    otpMap.delete(key); // too many wrong guesses, a new otp has to be requested
    return false;
  }

  const given = Buffer.from(String(otp));
  const expected = Buffer.from(otpData.otp);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return false;
  }

  // the otp is used up, it now allows one password reset for a short time
  otpData.otp = null;
  otpData.verifiedUntil = Date.now() + RESET_WINDOW;
  return true;
};

// returns { role } once after a successful validateOtp for this email, null otherwise
const consumeVerifiedOtp = (email) => {
  const key = otpKey(email);
  const otpData = otpMap.get(key);
  if (!otpData || !otpData.verifiedUntil || Date.now() > otpData.verifiedUntil) return null;
  otpMap.delete(key);
  return { role: otpData.role };
};

module.exports = { generateOtp, validateOtp, consumeVerifiedOtp, canSendOtp };
