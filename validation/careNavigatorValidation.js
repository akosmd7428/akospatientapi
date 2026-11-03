const { PATIENT_BACKEND_URL } = require('../config/secret');

// lab order statuses a care navigator may set, the labOrders.orderStatus enum plus 'Reschedule' used by the reschedule flow
const LAB_ORDER_STATUSES = ['pending', 'confirmed', 'cancelled', 'Sample Sent', 'Completed', 'Result Awaited', 'Report Generated', 'Reschedule'];

// pre employee isActive values: 1 scheduled, 2 completed, 3 pending, 4 cancelled, 5 rescheduled, 6 report generated, 7 confirmed.
// '' is still sent by the care navigator cancelled tab, kept so that screen keeps working
const PRE_EMPLOYEE_STATUSES = ['', '1', '2', '3', '4', '5', '6', '7'];

const isLabOrderStatus = (status) => typeof status === 'string' && LAB_ORDER_STATUSES.includes(status);

const isPreEmployeeStatus = (status) => (typeof status === 'string' || typeof status === 'number')
    && PRE_EMPLOYEE_STATUSES.includes(String(status).trim());

const parseUrl = (value) => {
    try {
        return new URL(String(value));
    } catch (error) {
        return null;
    }
};

// files are uploaded through /data/upload, which returns PATIENT_BACKEND_URL/assets/..., extra hosts can be listed in UPLOAD_ALLOWED_HOSTS (comma separated)
const getUploadBase = () => parseUrl(PATIENT_BACKEND_URL);

const getAllowedUploadHosts = () => {
    const hosts = String(process.env.UPLOAD_ALLOWED_HOSTS || '')
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean);
    const base = getUploadBase();
    if (base) hosts.push(base.host.toLowerCase());
    return hosts;
};

// only https links to our own upload hosts are stored and emailed to patients
const isAllowedUploadUrl = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) return false;
    const url = parseUrl(value.trim());
    if (!url || url.username || url.password) return false;
    const host = url.host.toLowerCase();
    if (!getAllowedUploadHosts().includes(host)) return false;
    if (url.protocol === 'https:') return true;
    // local/dev setups where PATIENT_BACKEND_URL itself is http
    const base = getUploadBase();
    return !!base && base.protocol === url.protocol && base.host.toLowerCase() === host;
};

module.exports = {
    LAB_ORDER_STATUSES,
    PRE_EMPLOYEE_STATUSES,
    isLabOrderStatus,
    isPreEmployeeStatus,
    isAllowedUploadUrl,
};
