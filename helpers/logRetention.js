'use strict';

/**
 * SEC-016 / SEC-024: the `logs` table had no createdAt and no retention policy,
 * so records accumulated indefinitely. HIPAA §164.316(b)(2) requires six-year
 * retention of documentation, not of raw diagnostic logs, and §164.502(b)
 * minimum-necessary argues against keeping them.
 *
 * Diagnostic log rows are purged after LOG_RETENTION_DAYS (default 90).
 * Expired OTP rows are cleared at the same time (SEC-021).
 *
 * Call scheduleLogRetention() once at startup.
 */

const { Op } = require('sequelize');
const Logs = require('../models/logsModel');
const { purgeExpiredOtps } = require('./otpHelper');

const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 90);
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function purgeOldLogs() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const removed = await Logs.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    return removed;
}

async function runRetention() {
    try {
        const logs = await purgeOldLogs();
        const otps = await purgeExpiredOtps();
        if (logs || otps) {
            console.log(`[retention] purged ${logs} log rows and ${otps} expired OTPs`);
        }
    } catch (err) {
        console.error('[retention] purge failed:', err.message);
    }
}

function scheduleLogRetention() {
    runRetention();
    const timer = setInterval(runRetention, RUN_INTERVAL_MS);
    timer.unref(); // never hold the process open
    return timer;
}

module.exports = { scheduleLogRetention, purgeOldLogs, runRetention, RETENTION_DAYS };
