// models/webhookLog.js
const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

// every request sent to a partner webhook (Across Assist) with its response, one row per call,
// the table is created by sequelizeDB1.sync() at startup
class WebhookLog extends Model {}

WebhookLog.init({
    // partner the webhook was sent to
    partner: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'across_assist'
    },
    // where it was sent from: lab_test, doctor_appointment, talk_to_doctor, manual (the api endpoint)
    source: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    // id of the lab order / appointment / call payment the webhook is about
    reference_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    patient_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // what happened at the place that triggered it, e.g. lab "Payment Completed" / "confirmed", appointment "booked"
    event: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    // sent = partner answered 2xx, failed = error answer / no answer / error while building,
    // skipped = not sent (company has is_call_webhook = 0, record not found, unknown source)
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'sent'
    },
    // why it was skipped: webhook_disabled, record_not_found, unknown_source
    skip_reason: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    // request_url: {
    //     type: DataTypes.STRING(500),
    //     allowNull: false
    // },
    // null for a skipped call, nothing was sent
    request_url: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    request_payload: {
        type: DataTypes.JSON,
        allowNull: true
    },
    // http status of the partner answer, null when there was no answer (timeout, connection error)
    response_status: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // partner answer as text (it may not be json)
    response_body: {
        type: DataTypes.TEXT('long'),
        allowNull: true
    },
    is_success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    error_message: {
        type: DataTypes.STRING(1000),
        allowNull: true
    },
    duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'webhook_logs',
    timestamps: true,
    indexes: [
        { fields: ['source', 'reference_id'] },
        { fields: ['status'] },
        { fields: ['patient_id'] },
        { fields: ['createdAt'] }
    ]
});

module.exports = WebhookLog;
