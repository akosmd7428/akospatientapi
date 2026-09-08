const Joi = require('joi');

const bookAppointmentValidation = Joi.object({
    patientId: Joi.number().integer().required(),
    doctorId: Joi.number().integer().required(),
    date: Joi.date().required(),
    time: Joi.string().required(),
    is_paid: Joi.optional()
});

const rescheduleAppointmentValidation = Joi.object({
    appointmentId: Joi.number().required(),
    date: Joi.date().required(),
    time: Joi.string().required()
});

const cancelAppointmentValidation = Joi.object({
    appointmentId: Joi.number().required()
});

module.exports = {
    bookAppointmentValidation,
    rescheduleAppointmentValidation,
    cancelAppointmentValidation
};