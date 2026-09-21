const nodemailer = require('nodemailer');
const {
  SMTP_SERVER,
  SMTP_USERNAME,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_SENDER_FROM,
} = require('../config/secret');
const { logError } = require('./logErrorHelper');

// Create a transporter object
/**
 * SEC-034: `ciphers: 'SSLv3'` constrained the cipher list to suites modern
 * OpenSSL has removed, so the negotiation either failed or fell back to a weak
 * one - on mail carrying password-reset OTPs and appointment details.
 *
 * requireTLS makes an unavailable STARTTLS a delivery failure rather than a
 * silent plaintext send, and rejectUnauthorized verifies the server certificate.
 * No `ciphers` override: Node's defaults are correct and stay current.
 */
const transporter = nodemailer.createTransport({
  host: SMTP_SERVER,
  port: Number(SMTP_PORT) || 587,
  secure: Number(SMTP_PORT) === 465, // implicit TLS on 465, STARTTLS otherwise
  requireTLS: true,
  auth: {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD,
  },
  tls: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
});

// Function to send an email
const emailHelperSMTP = async (userId, to, subject, htmlContent) => {
  const mailOptions = {
    from: SMTP_SENDER_FROM,
    to,
    subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    return "Email sent successfully";
  } catch (error) {
    console.error('Error sending email:', error.response);
    logError(
      1,
      error.response,
      'emailHelper.js',
      'sendEmail',
      '15',
      JSON.stringify(error)
    );
    return "Error sending email";
    throw new Error('Error sending email');
  }
};

module.exports = { emailHelperSMTP };
