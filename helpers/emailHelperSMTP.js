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
const transporter = nodemailer.createTransport({
  host: SMTP_SERVER,
  port: SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD,
  },
  tls: {
    ciphers: 'SSLv3',
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
