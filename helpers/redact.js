// field names whose values must never be written to the logs table
const SENSITIVE_KEY = /pass(word)?|otp|token|secret|code|card|cvv|aadhaar|pan(_?number)?$|encrypteddata|^iv$|authorization|signature|hash/i;

const redact = (value, depth = 0) => {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redact(item, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof val === 'string' && val.length > 500) {
      // base64 files and long text are not useful in the logs
      out[key] = `[${val.length} chars]`;
    } else {
      out[key] = redact(val, depth + 1);
    }
  }
  return out;
};

module.exports = { redact };
