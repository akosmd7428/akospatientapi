const { PATIENT_BACKEND_URL, PATIENT_FRONTEND_URL } = require('../config/secret');

// Shared branding for every outgoing AkosMD email
const BRAND = {
  name: 'AkosMD',
  team: 'Team AkosMD',
  careTeam: 'AkosMD Care Team',
  supportPhone: '+91-8595461929',
  supportEmail: 'support@akosmd.in',
  logoUrl: `${PATIENT_BACKEND_URL}/assets/akosLogo.png`,
  primary: '#0B5FA5',
  text: '#333333',
  muted: '#6B7280',
  border: '#E5E7EB',
  background: '#F4F6F8',
};

// Escape user/DB supplied values before injecting them into HTML
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// links in emails must be plain http(s) urls, anything else (javascript:, data:) is dropped
const safeUrl = (value) => (/^https?:\/\//i.test(String(value ?? '').trim()) ? String(value).trim() : '#');

// subjects are mail headers, a value must never break onto a new header line
const headerText = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ');

const paragraph = (html) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${BRAND.text};">${html}</p>`;

const button = (label, link) => {
  const href = safeUrl(link);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    <tr>
      <td style="border-radius:6px;background:${BRAND.primary};">
        <a href="${esc(href)}" target="_blank"
           style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:${BRAND.muted};">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="${esc(href)}" style="color:${BRAND.primary};word-break:break-all;">${esc(href)}</a>
  </p>`;
};

// Key/value box, e.g. appointment date & time or contact details
const detailsTable = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 20px;border:1px solid ${BRAND.border};border-radius:6px;background:#FAFBFC;">
    ${rows
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(
        ([label, value]) => `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:${BRAND.muted};width:35%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 16px;font-size:14px;color:${BRAND.text};font-weight:bold;white-space:pre-wrap;">${esc(value)}</td>
      </tr>`
      )
      .join('')}
  </table>`;

const supportLine = () =>
  paragraph(
    `If you have any questions or need further assistance, please contact our support team at <strong>${BRAND.supportPhone}</strong>.`
  );

/**
 * Wraps body content in the common AkosMD layout (logo header, card, footer).
 */
const layout = ({ title, preheader = '', body, signOff = `Thank you!<br/><strong>${BRAND.team}</strong>` }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.background};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td align="center" style="padding:24px;border-bottom:3px solid ${BRAND.primary};">
              <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="140" style="display:block;border:0;max-width:140px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 16px;">
              <h1 style="margin:0 0 20px;font-size:22px;line-height:30px;color:${BRAND.primary};">${esc(title)}</h1>
              ${body}
              <p style="margin:24px 0 0;font-size:15px;line-height:24px;color:${BRAND.text};">
                ${signOff}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#FAFBFC;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:18px;color:${BRAND.muted};text-align:center;">
                &copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.<br/>
                This is an automated message, please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const build = (subject, title, body, preheader, signOff) => ({
  subject: headerText(subject),
  html: layout({ title, preheader: preheader || title, body, signOff }),
});

const careTeamSignOff = `Regards,<br/><strong>${BRAND.careTeam}</strong>`;

const supportEmailLink = `<a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primary};">${BRAND.supportEmail}</a>`;

/* ------------------------------------------------------------------ */
/* Account / authentication                                            */
/* ------------------------------------------------------------------ */

const emailVerification = ({ name, corporateName, link, expiresIn = '24 hours' }) =>
  build(
    'Verify your email to complete your AkosMD registration',
    'Verify Your Email Address',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(
        `Thanks for registering with ${BRAND.name}${corporateName ? ` through <strong>${esc(corporateName)}</strong>` : ''}. ` +
          'Verify your email address to complete your registration by using the link below:'
      ) +
      button('Verify Email Address', link) +
      paragraph(
        `This link expires in <strong>${esc(expiresIn)}</strong>. If it expires, request a new verification email from ${supportEmailLink}.`
      ) +
      paragraph(`If you did not create an ${BRAND.name} account, please ignore this email.`),
    'Verify your email address to complete your AkosMD registration.',
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

const otpCode = ({ otp }) =>
  build(
    'OTP Code',
    'Your One-Time Password',
    paragraph('Hello,') +
      paragraph('Use the following One-Time Password (OTP) to continue:') +
      `<div style="margin:0 0 20px;padding:16px;text-align:center;background:#F0F6FC;border:1px dashed ${BRAND.primary};border-radius:6px;">
         <span style="font-size:30px;letter-spacing:8px;font-weight:bold;color:${BRAND.primary};">${esc(otp)}</span>
       </div>` +
      paragraph('This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.') +
      paragraph('If you did not request this OTP, please ignore this email.'),
    `Your AkosMD OTP is ${otp}`
  );

const dependentInvite = ({ link }) =>
  build(
    'Welcome To AKOS',
    "You've Been Added as a Dependent!",
    paragraph('Hello,') +
      paragraph('We are pleased to inform you that a patient has added you as a dependent in their account with us.') +
      paragraph(
        'To complete your profile and get access to all the features, please update your information by clicking the button below:'
      ) +
      button('Complete Your Profile', link) +
      paragraph('This helps us keep your information accurate and serve you better.') +
      paragraph('If you were not expecting this email or have questions, feel free to contact our support team.')
  );

/* ------------------------------------------------------------------ */
/* Prescriptions                                                       */
/* ------------------------------------------------------------------ */

const prescriptionReady = ({ name, link }) =>
  build(
    'Prescription Received',
    'Your Prescription Is Ready',
    paragraph(`Hi ${esc(name)},`) +
      paragraph('Your prescription is now available for download.') +
      button('Download Prescription', link) +
      supportLine()
  );

/* ------------------------------------------------------------------ */
/* Telehealth appointments                                             */
/* ------------------------------------------------------------------ */

const appointmentRequested = ({ patientName, date, time }) =>
  build(
    'Appointment Requested',
    'Appointment Requested',
    paragraph(`Hi ${esc(patientName)},`) +
      paragraph(`Your appointment with ${BRAND.name} has been requested and is awaiting confirmation. We will update you once it is confirmed.`) +
      detailsTable([['Date', date], ['Time', time], ['Status', 'Awaiting confirmation']]) +
      paragraph(`If you need to reschedule, contact us at <strong>${BRAND.supportPhone}</strong>.`) +
      paragraph('Looking forward to your appointment!')
  );

const callScheduledPatient = ({ patientName, date, time }) =>
  build(
    'Call Scheduled',
    'Your Telehealth Call Is Confirmed',
    paragraph(`Hi ${esc(patientName)},`) +
      paragraph(`Your telehealth call with ${BRAND.name} has been confirmed.`) +
      detailsTable([['Date', date], ['Time', time]]) +
      paragraph('Please make sure you are available at that time and have a stable internet connection.') +
      supportLine() +
      paragraph('See you then!')
  );

const consultationBookedDoctor = ({ doctorName, patientName, date, time }) =>
  build(
    'Consultation Booked',
    'New Consultation Scheduled',
    paragraph(`Hi ${esc(doctorName)},`) +
      paragraph('A new telehealth consultation has been scheduled. Please check your schedule and make sure you are prepared.') +
      detailsTable([['Patient', patientName], ['Date', date], ['Time', time]]) +
      paragraph(`If you need to adjust the timing or have any questions, please contact us at <strong>${BRAND.supportPhone}</strong>.`)
  );

const callCancelledPatient = ({ patientName, date, time }) =>
  build(
    'Call Cancelled',
    'Your Telehealth Call Was Cancelled',
    paragraph(`Hi ${esc(patientName)},`) +
      paragraph('We regret to inform you that your telehealth call has been cancelled.') +
      detailsTable([['Date', date], ['Time', time]]) +
      paragraph(`Please contact us at <strong>${BRAND.supportPhone}</strong> to reschedule or for any further assistance.`) +
      paragraph('We apologize for the inconvenience and appreciate your understanding.')
  );

const callCancelledDoctor = ({ doctorName, patientName, date, time }) =>
  build(
    'Call Cancelled',
    'Telehealth Call Cancelled',
    paragraph(`Hi ${esc(doctorName)},`) +
      paragraph('The following telehealth call has been cancelled. Please check your schedule for any adjustments.') +
      detailsTable([['Patient', patientName], ['Date', date], ['Time', time]]) +
      supportLine()
  );

/* ------------------------------------------------------------------ */
/* Lab / call bookings                                                 */
/* ------------------------------------------------------------------ */

// status: confirmed | cancelled | completed | reportGenerated | rescheduled
const BOOKING_STATUS = {
  confirmed: { label: 'Confirmed', patient: 'has been successfully confirmed', other: 'has been successfully confirmed' },
  cancelled: { label: 'Cancelled', patient: 'has been cancelled', other: 'has been cancelled' },
  completed: { label: 'Completed', patient: 'has been completed', other: 'has been completed' },
  reportGenerated: { label: 'Report Generated', patient: 'report has been generated', other: 'report has been generated' },
  rescheduled: { label: 'Rescheduled', patient: 'has been rescheduled', other: 'has been rescheduled' },
};

// Request ID (when known) plus the old/new slot for a reschedule
const bookingRows = ({ status, requestId, fromDate, fromTime, toDate, toTime }) => {
  const rows = [['Request ID', requestId]];
  if (status === 'rescheduled') {
    rows.push(
      ['Previous slot', [fromDate, fromTime].filter(Boolean).join(' at ')],
      ['New slot', [toDate, toTime].filter(Boolean).join(' at ')]
    );
  }
  return rows.some(([, value]) => value !== undefined && value !== null && value !== '') ? detailsTable(rows) : '';
};

const withRequestId = (text, requestId) => (requestId ? `${text} - Request ID ${requestId}` : text);

/**
 * Booking status update sent to the patient.
 * bookingType: 'Lab' (default) or 'Call' — only changes the wording/subject.
 */
const bookingStatusPatient = ({ name, status, bookingType = 'Lab', subject, ...details }) => {
  const s = BOOKING_STATUS[status];
  const noun = bookingType === 'Call' ? 'call booking' : 'lab test booking';
  return build(
    subject || withRequestId(`${bookingType} Booking ${s.label}`, details.requestId),
    `${bookingType} Booking ${s.label}`,
    paragraph(`Hi ${esc(name)},`) +
      paragraph(`We would like to inform you that your ${noun} ${s.patient}.`) +
      bookingRows({ status, ...details }) +
      supportLine()
  );
};

// "through Acme Corp" when the patient belongs to a corporate, otherwise nothing
const throughCorporate = (corporateName) => (corporateName ? ` through <strong>${esc(corporateName)}</strong>` : '');

const healthCheckupRows = ({ requestId, date, time, location }) =>
  detailsTable([
    ['Request ID', requestId],
    ['Date', date],
    ['Time', time],
    ['Location', location],
  ]);

/**
 * Sent once payment is completed: the request is placed but the lab
 * has not confirmed the slot yet.
 */
const healthCheckupRequestReceived = ({ name, corporateName, date, time, location, requestId }) =>
  build(
    `Health Check-up Request Received${requestId ? ` - Request ID ${requestId}` : ''}`,
    'Health Check-up Request Received',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(
        `We have received your request for a Health Check-up${throughCorporate(corporateName)}. ` +
          'Here are the details you requested:'
      ) +
      healthCheckupRows({ requestId, date, time, location }) +
      paragraph('<strong>Your appointment is not confirmed yet.</strong> We will email you as soon as the booking is confirmed.') +
      paragraph(`If you need to update your request, contact ${supportEmailLink}.`),
    'We have received your Health Check-up request. We will email you once it is confirmed.',
    careTeamSignOff
  );

/** Sent when the lab confirms the health check-up booking. */
// sent to the patient when the care navigator approves (confirms) the booking
const healthCheckupConfirmed = ({ name, corporateName, date, time, location, requestId }) =>
  build(
    `Your health check-up is confirmed${date ? ` | ${date}` : ''}`,
    'Your Health Check-up Is Confirmed',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(`Your Health Check-up appointment${throughCorporate(corporateName)} is confirmed.`) +
      detailsTable([
        ['Date', date],
        ['Time', time],
        ['Location or provider', location],
        ['Booking ID', requestId],
      ]) +
      paragraph(
        `Please review any preparation instructions from ${BRAND.name}. If you need to change your appointment, contact ${supportEmailLink}.`
      ),
    'Your Health Check-up appointment is confirmed.',
    careTeamSignOff
  );

/**
 * Sent to the patient's care navigator(s) once a health check-up is booked
 * (payment completed), so they can check availability and confirm the slot.
 */
const healthCheckupReviewCareNavigator = ({ careNavigatorName, customerName, corporateName, date, time, location, requestId }) =>
  build(
    `Health Check-up Request Needs Review${requestId ? ` - Request ID ${requestId}` : ''}`,
    'Health Check-up Request Needs Review',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('A health check-up request needs review. Please check availability and update the request status.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Requested date and time', [date, time].filter(Boolean).join(', ')],
        ['Preferred location or provider', location],
        ['Request ID', requestId],
      ]) +
      paragraph('Once the slot is confirmed, send the customer the confirmation message with the finalized appointment details.'),
    `Review needed: health check-up request ${requestId || ''} for ${customerName || 'a customer'}.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** Sent to the patient's care navigator(s) once the health check-up booking is confirmed (approved). */
const healthCheckupConfirmedCareNavigator = ({ careNavigatorName, customerName, corporateName, date, time, location, requestId }) =>
  build(
    `Booking confirmed for ${customerName || 'customer'}${requestId ? ` | ${requestId}` : ''}`,
    'Health Check-up Booking Confirmed',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('The health check-up booking below has been confirmed.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Appointment', [date, time].filter(Boolean).join(' at ')],
        ['Location or provider', location],
        ['Booking ID', requestId],
      ]) +
      paragraph('Please update any outstanding coordination notes and follow the applicable process for sharing provider instructions with the customer.'),
    `Health check-up booking ${requestId || ''} for ${customerName || 'a customer'} is confirmed.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/**
 * Patient rescheduled a health check-up: alert sent to the patient's care navigator(s).
 * alternative (optional) is shown only when provided.
 */
const healthCheckupRescheduleRequest = ({
  careNavigatorName, customerName, corporateName, currentDate, currentTime, preferredDate, preferredTime, alternative, requestId,
}) =>
  build(
    ['Customer reschedule request', customerName, requestId].filter(Boolean).join(' | '),
    'Customer Reschedule Request',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph(
        'A customer has requested a change to a confirmed health check-up appointment. Please review availability and coordinate the next step.'
      ) +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Booking ID', requestId],
        ['Current appointment', [currentDate, currentTime].filter(Boolean).join(' at ')],
        ['Preferred new date and time', [preferredDate, preferredTime].filter(Boolean).join(' at ')],
        ['Alternative (optional)', alternative],
      ]) +
      paragraph(
        'Keep the current appointment confirmed until the replacement appointment is agreed and recorded. Then send the customer the rescheduling confirmation.'
      ),
    `${customerName || 'A customer'} requested to reschedule booking ${requestId || ''}.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** An approved health check-up was moved to a new slot: sent to the patient. */
const healthCheckupRescheduled = ({ name, corporateName, previousDate, previousTime, date, time, location, requestId }) =>
  build(
    `Your health check-up has been rescheduled${date ? ` | ${date}` : ''}`,
    'Your Health Check-up Has Been Rescheduled',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(`Your health check-up appointment${throughCorporate(corporateName)} has been rescheduled.`) +
      detailsTable([
        ['Previous appointment', [previousDate, previousTime].filter(Boolean).join(' at ')],
        ['New appointment', [date, time].filter(Boolean).join(' at ')],
        ['Location or provider', location],
        ['Booking ID', requestId],
      ]),
    'Your health check-up appointment has been rescheduled.',
    careTeamSignOff
  );

/** Health check-up booking cancelled (e.g. by the care navigator): sent to the patient. */
const healthCheckupCancelled = ({ name, corporateName, date, time, location, requestId }) => {
  const portal = PATIENT_FRONTEND_URL
    ? `<a href="${esc(PATIENT_FRONTEND_URL)}" style="color:${BRAND.primary};">Portal</a>`
    : 'Portal';
  return build(
    `Your health check-up has been cancelled${requestId ? ` | ${requestId}` : ''}`,
    'Your Health Check-up Has Been Cancelled',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(`Your health check-up appointment${throughCorporate(corporateName)} has been cancelled as requested or recorded.`) +
      detailsTable([
        ['Cancelled appointment', [date, time].filter(Boolean).join(' at ')],
        ['Location or provider', location],
        ['Booking ID', requestId],
      ]) +
      paragraph(`If you would like to book another appointment, contact ${supportEmailLink} or submit a new request through ${portal}.`),
    'Your health check-up appointment has been cancelled.',
    careTeamSignOff
  );
};

/** Health check-up marked completed (by the care navigator): sent to the patient. */
const healthCheckupCompleted = ({ name, corporateName, requestId }) =>
  build(
    `Your health check-up is completed${requestId ? ` | ${requestId}` : ''}`,
    'Your Health Check-up Is Completed',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(`Our records show that your health check-up${throughCorporate(corporateName)} has been completed.`) +
      detailsTable([['Booking ID', requestId]]) +
      paragraph(`We will notify you when your report is available. For help, contact ${supportEmailLink}.`),
    'Your health check-up has been completed.',
    careTeamSignOff
  );

/** Health check-up report generated: sent to the patient (report itself is never attached). */
const healthCheckupReportReady = ({ name, corporateName, requestId }) => {
  const portal = PATIENT_FRONTEND_URL
    ? `<a href="${esc(PATIENT_FRONTEND_URL)}" style="color:${BRAND.primary};">secure portal</a>`
    : 'secure portal';
  return build(
    `Your health check-up report is ready${requestId ? ` | ${requestId}` : ''}`,
    'Your Health Check-up Report Is Ready',
    paragraph(`Hello ${esc(name)},`) +
      paragraph(`Your health check-up report${corporateName ? ` for <strong>${esc(corporateName)}</strong>` : ''} is ready.`) +
      detailsTable([['Booking ID', requestId]]) +
      paragraph(
        `For your privacy, the report is available through the ${portal} and is not attached to this email. ` +
          `If you cannot access it, contact ${supportEmailLink}.`
      ),
    'Your health check-up report is ready in the portal.',
    careTeamSignOff
  );
};

/** Patient rescheduled a health check-up: acknowledgement sent to the patient. */
const healthCheckupRescheduleAcknowledgement = ({ customerName, corporateName, currentDate, currentTime, requestId }) =>
  build(
    `We received your rescheduling request${requestId ? ` | ${requestId}` : ''}`,
    'Rescheduling Request Received',
    paragraph(`Hello ${esc(customerName)},`) +
      paragraph(
        `We have received your request to reschedule your health check-up${throughCorporate(corporateName)}. ` +
          'We are checking availability and will contact you with an update.'
      ) +
      detailsTable([
        ['Booking ID', requestId],
        ['Current appointment', [currentDate, currentTime].filter(Boolean).join(' at ')],
      ]),
    'We have received your request to reschedule your health check-up.',
    careTeamSignOff
  );

/** Care navigator moved an approved health check-up: sent to the patient's care navigator(s). */
const healthCheckupRescheduledCareNavigator = ({
  careNavigatorName, customerName, corporateName, requestId, previousDate, previousTime, date, time,
}) =>
  build(
    `Appointment rescheduled for ${customerName || 'customer'}${requestId ? ` | ${requestId}` : ''}`,
    'Health Check-up Appointment Rescheduled',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('The health check-up appointment below has been rescheduled.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Booking ID', requestId],
        ['Previous appointment', [previousDate, previousTime].filter(Boolean).join(' at ')],
        ['New appointment', [date, time].filter(Boolean).join(' at ')],
      ]),
    `Booking ${requestId || ''} for ${customerName || 'a customer'} has been rescheduled.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** Health check-up booking cancelled: sent to the patient's care navigator(s). */
const healthCheckupCancelledCareNavigator = ({ careNavigatorName, customerName, corporateName, date, time, requestId, cancelledBy }) =>
  build(
    `Appointment cancelled for ${customerName || 'customer'}${requestId ? ` | ${requestId}` : ''}`,
    'Health Check-up Booking Cancelled',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('The health check-up booking below has been cancelled.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Appointment', [date, time].filter(Boolean).join(' at ')],
        ['Booking ID', requestId],
        ['Cancelled by', cancelledBy],
      ]) +
      paragraph('Please update any related coordination notes and notify the provider or location if required by the applicable process.'),
    `Booking ${requestId || ''} for ${customerName || 'a customer'} has been cancelled.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** Health check-up marked completed: sent to the patient's care navigator(s). */
const healthCheckupCompletedCareNavigator = ({ careNavigatorName, customerName, corporateName, date, requestId }) =>
  build(
    `Health check-up marked completed for ${customerName || 'customer'}${requestId ? ` | ${requestId}` : ''}`,
    'Health Check-up Marked Completed',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('The health check-up below has been marked as completed.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Appointment date', date],
        ['Booking ID', requestId],
      ]) +
      paragraph('If a report is expected, continue tracking it through the applicable report workflow.'),
    `Health check-up ${requestId || ''} for ${customerName || 'a customer'} has been marked completed.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** Health check-up report generated: sent to the patient's care navigator(s). */
const healthCheckupReportGeneratedCareNavigator = ({ careNavigatorName, customerName, corporateName, requestId, reportId, portalStatus }) =>
  build(
    `Report generated for ${customerName || 'customer'}${requestId ? ` | ${requestId}` : ''}`,
    'Health Check-up Report Generated',
    paragraph(`Hello ${esc(careNavigatorName)},`) +
      paragraph('The health check-up report below has been generated and recorded as available.') +
      detailsTable([
        ['Customer', customerName],
        ['Corporate', corporateName],
        ['Booking ID', requestId],
        ['Report ID', reportId],
        ['Portal status', portalStatus],
      ]) +
      paragraph(
        'Please verify that the report is linked to the correct customer record and follow the approved process to notify the customer. ' +
          '<strong>Do not send the report as an email attachment.</strong>'
      ),
    `Report generated for booking ${requestId || ''}.`,
    `Regards,<br/><strong>AkosMD Team</strong>`
  );

/** Booking status update sent to the patient's care navigator(s). */
const bookingStatusCareNavigator = ({ careNavigatorName, patientName, status, ...details }) => {
  const s = BOOKING_STATUS[status];
  return build(
    withRequestId(`Lab Booking ${s.label}`, details.requestId),
    `Lab Booking ${s.label}`,
    paragraph(`Hi ${esc(careNavigatorName)},`) +
      paragraph(`We would like to inform you that <strong>${esc(patientName)}</strong>'s lab test booking ${s.other}.`) +
      bookingRows({ status, ...details })
  );
};

/* ------------------------------------------------------------------ */
/* Internal / admin notifications                                      */
/* ------------------------------------------------------------------ */

/**
 * Help / contact requests forwarded to the admin inbox.
 * details: [[label, value], ...]
 */
const adminRequest = ({ subject, title, intro, details, message }) =>
  build(
    subject,
    title || subject,
    paragraph(esc(intro) || 'A new request has been submitted with the following details:') +
      detailsTable([...details, ['Message', message]])
  );

module.exports = {
  layout,
  esc,
  emailVerification,
  otpCode,
  dependentInvite,
  prescriptionReady,
  appointmentRequested,
  callScheduledPatient,
  consultationBookedDoctor,
  callCancelledPatient,
  callCancelledDoctor,
  bookingStatusPatient,
  healthCheckupRequestReceived,
  healthCheckupConfirmed,
  healthCheckupReviewCareNavigator,
  healthCheckupConfirmedCareNavigator,
  healthCheckupRescheduleRequest,
  healthCheckupRescheduleAcknowledgement,
  healthCheckupRescheduled,
  healthCheckupRescheduledCareNavigator,
  healthCheckupCancelled,
  healthCheckupCancelledCareNavigator,
  healthCheckupCompleted,
  healthCheckupCompletedCareNavigator,
  healthCheckupReportReady,
  healthCheckupReportGeneratedCareNavigator,
  bookingStatusCareNavigator,
  adminRequest,
};
