const nodemailer = require('nodemailer');
const { DEV_SENDGRID_API_KEY, SENDER_FROM } = require('../config/secret');
const { logError } = require('./logErrorHelper');

// Create a transporter object
const transporter = nodemailer.createTransport({
  service: 'SendGrid',
  auth: {
    user: 'apikey',
    pass: DEV_SENDGRID_API_KEY,
  },
});


// Function to send an email
const emailHelper = async (userId, to, subject, htmlContent) => {
  const mailOptions = {
    from: SENDER_FROM,
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


module.exports = { emailHelper };
