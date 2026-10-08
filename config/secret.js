// Secret keys and environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const DEV_SENDGRID_API_KEY = process.env.DEV_SENDGRID_API_KEY;
const SEND_CONTACT_EMAIL_TO_ADMIN = process.env.SEND_CONTACT_EMAIL_TO_ADMIN;
const SENDER_FROM = process.env.SENDER_FROM;
const DB_HOST1 = process.env.DB_HOST1;
const DB_USER1 = process.env.DB_USER1;
const DB_PASSWORD1 = process.env.DB_PASSWORD1;
const DB_PORT1 = process.env.DB_PORT1;
const DB_NAME1 = process.env.DB_NAME1;
const LIVE_MCHEMIST_URL = process.env.LIVE_MCHEMIST_URL;
const PATIENT_FRONTEND_URL = process.env.PATIENT_FRONTEND_URL;
const PATIENT_BACKEND_URL = process.env.PATIENT_BACKEND_URL;
const DEV_PAYUMONEY_LINK = process.env.DEV_PAYUMONEY_LINK;
const DEV_PAYU_MONEY_SALT = process.env.DEV_PAYU_MONEY_SALT;
const DEV_PAYU_MONEY_KEY = process.env.DEV_PAYU_MONEY_KEY;
const DEV_PAYU_SUCCESS_URL = process.env.DEV_PAYU_SUCCESS_URL;
const DEV_PAYU_FAILED_URL = process.env.DEV_PAYU_FAILED_URL;
const DEV_PAYU_CANCEL_URL = process.env.DEV_PAYU_CANCEL_URL;
const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_SENDER_ID = process.env.SMS_SENDER_ID;
const SMS_ENTITY_ID = process.env.SMS_ENTITY_ID;
const SMS_TEMPLATE_ID = process.env.SMS_TEMPLATE_ID;
const SMS_API_URL = process.env.SMS_API_URL;

// SMTP configuration for Office 365
const SMTP_SERVER = process.env.SMTP_SERVER;
const SMTP_USERNAME = process.env.SMTP_USERNAME;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_SENDER_FROM = process.env.SMTP_SENDER_FROM;
const REDCLIFF_BASE_URL = process.env.REDCLIFF_URL;
const REDCLIFF_COOKIE = process.env.REDCLIFF_COOKIE;
const REDCLIFF_KEY = process.env.REDCLIFF_KEY;

// encryption keys and tokens, never hard-code these in the code
const DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY;
const DATA_ENCRYPTION_IV = process.env.DATA_ENCRYPTION_IV;
const AES_SECRET_KEY = process.env.AES_SECRET_KEY;
const PRESCRIPTION_LINK_SECRET = process.env.PRESCRIPTION_LINK_SECRET;
const BITLY_ACCESS_TOKEN = process.env.BITLY_ACCESS_TOKEN;

// stop the app at startup when a required security value is missing from .env
const REQUIRED_SECURITY_ENV = ['JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_ENCRYPTION_IV', 'AES_SECRET_KEY', 'PRESCRIPTION_LINK_SECRET'];
const missingSecurityEnv = REQUIRED_SECURITY_ENV.filter(name => !process.env[name]);
if (missingSecurityEnv.length) {
    throw new Error(`Missing required security values in .env: ${missingSecurityEnv.join(', ')}`);
}

const APPOINTMENT_STATUS = {
    UPCOMING: "Upcoming",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    CANCELLED_VALUE: 3
};

module.exports = { 
    JWT_SECRET, 
    SENDER_FROM, 
    SEND_CONTACT_EMAIL_TO_ADMIN, 
    DEV_SENDGRID_API_KEY, 
    DB_HOST1, 
    DB_USER1, 
    DB_PASSWORD1, 
    DB_PORT1, 
    DB_NAME1, 
    LIVE_MCHEMIST_URL, 
    APPOINTMENT_STATUS, 
    PATIENT_FRONTEND_URL, 
    PATIENT_BACKEND_URL, 
    DEV_PAYUMONEY_LINK, 
    DEV_PAYU_MONEY_SALT, 
    DEV_PAYU_MONEY_KEY, 
    DEV_PAYU_SUCCESS_URL, 
    DEV_PAYU_FAILED_URL, 
    DEV_PAYU_CANCEL_URL, 
    SMS_API_KEY, 
    SMS_SENDER_ID, 
    SMS_ENTITY_ID, 
    SMS_TEMPLATE_ID, 
    SMS_API_URL, 
    SMTP_SERVER,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_SENDER_FROM,
    REDCLIFF_BASE_URL,
    REDCLIFF_COOKIE,
    REDCLIFF_KEY,
    DATA_ENCRYPTION_KEY,
    DATA_ENCRYPTION_IV,
    AES_SECRET_KEY,
    PRESCRIPTION_LINK_SECRET,
    BITLY_ACCESS_TOKEN
};
