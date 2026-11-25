const crypto = require('crypto');
const forge = require('node-forge');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const { getToken } = require('./gatewayService');

// Certificate cache
let certCache = {
  publicKey: null,
  algorithm: null,
  fetchedAt: 0,
};

/**
 * Fetch the ABDM public certificate from the ABHA service.
 * GET /abha/api/v3/profile/public/certificate
 * Returns { publicKey, encryptionAlgorithm }
 *
 * M1/PHR uses RSA/ECB/OAEPWithSHA-1AndMGF1Padding.
 * The algorithm is read from the response, not hard-coded.
 */
async function fetchCertificate() {
  if (certCache.publicKey && (Date.now() - certCache.fetchedAt) < abdmConfig.certCacheTTL) {
    return certCache;
  }

  const token = await getToken();
  const url = `${abdmConfig.abhaUrl}${abdmConfig.m1.publicCertificate}`;
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'REQUEST-ID': uuidv4(),
      'TIMESTAMP': new Date().toISOString(),
    },
    timeout: 15000,
  });

  const { publicKey: certData, encryptionAlgorithm } = response.data;

  if (!certData) {
    throw new Error('ABDM certificate response missing publicKey');
  }

  // The certificate arrives as base64 DER with no PEM armour - add it
  let pemKey;
  if (certData.includes('BEGIN')) {
    // Already PEM-armoured
    pemKey = certData;
  } else {
    // Wrap base64 DER in PEM armour
    pemKey = `-----BEGIN PUBLIC KEY-----\n${certData}\n-----END PUBLIC KEY-----`;
  }

  certCache = {
    publicKey: pemKey,
    algorithm: encryptionAlgorithm || 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding',
    fetchedAt: Date.now(),
  };

  return certCache;
}

/**
 * Encrypt a sensitive value with ABDM's RSA public key.
 * Uses RSA-OAEP with SHA-1 (as the ABDM certificate response specifies).
 *
 * Used for: Aadhaar number, mobile number, OTP value, ABHA number, email, password.
 * @param {string} plaintext - Value to encrypt
 * @returns {string} Base64-encoded ciphertext
 */
async function rsaEncrypt(plaintext) {
  const { publicKey: pemKey } = await fetchCertificate();

  // Node.js crypto RSA-OAEP with SHA-1 (matching ABDM's RSA/ECB/OAEPWithSHA-1AndMGF1Padding)
  const encrypted = crypto.publicEncrypt(
    {
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    Buffer.from(plaintext, 'utf8')
  );

  return encrypted.toString('base64');
}

/**
 * Clear the certificate cache (use when rotation is detected or on auth failure).
 */
function clearCertCache() {
  certCache = { publicKey: null, algorithm: null, fetchedAt: 0 };
}

module.exports = {
  fetchCertificate,
  rsaEncrypt,
  clearCertCache,
};
