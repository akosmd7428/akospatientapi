const crypto = require('crypto');

// in-memory store, one entry per email: { otp, role, expirationTime, attempts, sentAt, verifiedUntil, verifiedIp, resetHash }
const otpMap = new Map();
// wrong guesses per email, kept across resends so a new otp does not give a fresh set of guesses
const failMap = new Map();
const OTP_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the otp is thrown away
const MAX_FAILS_PER_WINDOW = 10; // wrong guesses per email before it is locked
const FAIL_WINDOW = 60 * 60 * 1000; // 1 hour
const RESEND_COOLDOWN = 30 * 1000; // matches the resend timer of the frontends
const RESET_WINDOW = 10 * 60 * 1000; // time to set the new password after the otp is verified

const otpKey = (email) => String(email || '').trim().toLowerCase();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const getFails = (key) => {
  const entry = failMap.get(key);
  if (!entry || Date.now() - entry.windowStart > FAIL_WINDOW) return { count: 0, windowStart: Date.now() };
  return entry;
};

const isLocked = (key) => getFails(key).count >= MAX_FAILS_PER_WINDOW;

const recordFail = (key) => {
  const entry = getFails(key);
  entry.count += 1;
  failMap.set(key, entry);
};

// false when an otp was sent to this email moments ago or the email is locked, stops email flooding
const canSendOtp = (email) => {
  const key = otpKey(email);
  if (isLocked(key)) return false;
  const otpData = otpMap.get(key);
  return !otpData || !otpData.sentAt || Date.now() - otpData.sentAt >= RESEND_COOLDOWN;
};

const generateOtp = (email, role) => {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();
  otpMap.set(otpKey(email), { otp, role, expirationTime: now + OTP_EXPIRATION_TIME, attempts: 0, sentAt: now, verifiedUntil: 0 });
  return otp;
};

// returns a one time reset token on success, false otherwise
const validateOtp = (email, otp, clientIp = null) => {
  const key = otpKey(email);
  if (isLocked(key)) return false;
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

  if (!safeEqual(otp, otpData.otp)) {
    recordFail(key);
    return false;
  }

  // the otp is used up, it now allows one password reset for a short time,
  // only for the client that verified it (same ip, or the reset token returned to it)
  const resetToken = crypto.randomBytes(32).toString('hex');
  otpData.otp = null;
  otpData.verifiedUntil = Date.now() + RESET_WINDOW;
  otpData.verifiedIp = clientIp;
  otpData.resetHash = sha256(resetToken);
  failMap.delete(key);
  return resetToken;
};

// returns { role } once after a successful validateOtp for this email, null otherwise.
// the caller must send the reset token from verify-otp, or come from the ip that verified the otp
const consumeVerifiedOtp = (email, { clientIp = null, resetToken = null } = {}) => {
  const key = otpKey(email);
  const otpData = otpMap.get(key);
  if (!otpData || !otpData.verifiedUntil || Date.now() > otpData.verifiedUntil) return null;
  const sameClient = resetToken
    ? safeEqual(sha256(resetToken), otpData.resetHash)
    : Boolean(otpData.verifiedIp) && otpData.verifiedIp === clientIp;
  if (!sameClient) return null;
  otpMap.delete(key);
  return { role: otpData.role };
};

module.exports = { generateOtp, validateOtp, consumeVerifiedOtp, canSendOtp };
