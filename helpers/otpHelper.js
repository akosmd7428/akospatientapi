const otpMap = new Map();
const OTP_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes

const generateOtp = (email) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationTime = Date.now() + OTP_EXPIRATION_TIME;
  otpMap.set(email, { otp, expirationTime });
  return otp;
};

const validateOtp = (email, otp) => {
  const otpData = otpMap.get(email);
  if (!otpData) return false;
  
  if (Date.now() > otpData.expirationTime) {
    otpMap.delete(email); // Remove expired OTP
    return false;
  }
  
  return otpData.otp === otp;
};

module.exports = { generateOtp, validateOtp };
