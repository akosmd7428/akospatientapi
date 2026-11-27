'use strict';
/**
 * Fidelius encryption service for ABDM M2/M3 health data transfer.
 * Implements X25519 ECDH key exchange + HKDF key derivation + AES-256-GCM encryption.
 * Ref: https://docs.abdm.gov.in/docs/hiecm/v3/concepts/data-flow
 *
 * Wire format for encryptedData: base64( iv[12] || authTag[16] || ciphertext )
 */
const crypto = require('crypto');

// DER header for X25519 public key (SubjectPublicKeyInfo / SPKI)
// 30 2a 30 05 06 03 2b 65 6e 03 21 00  followed by 32 raw bytes
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

// DER header for X25519 private key (PKCS8)
// 30 2e 02 01 00 30 05 06 03 2b 65 6e 04 22 04 20  followed by 32 raw bytes
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

/**
 * HKDF-SHA256 (RFC 5869) — works on all Node.js versions.
 */
function hkdf(ikm, salt, info, length) {
  const ikmBuf = Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm);
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
  const infoBuf = Buffer.isBuffer(info) ? info : Buffer.from(info);

  // Extract
  const prk = crypto.createHmac('sha256', saltBuf).update(ikmBuf).digest();

  // Expand
  const blocks = Math.ceil(length / 32);
  const okm = Buffer.alloc(length);
  let prev = Buffer.alloc(0);

  for (let i = 0; i < blocks; i++) {
    const block = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([prev, infoBuf, Buffer.from([i + 1])]))
      .digest();
    block.copy(okm, i * 32, 0, Math.min(32, length - i * 32));
    prev = block;
  }

  return okm;
}

/**
 * Import a raw 32-byte Base64 X25519 public key as a Node.js KeyObject.
 */
function importPublicKey(rawBase64) {
  const rawKey = Buffer.from(rawBase64, 'base64');
  const spkiDer = Buffer.concat([X25519_SPKI_PREFIX, rawKey]);
  return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
}

/**
 * Import a raw 32-byte Base64 X25519 private key as a Node.js KeyObject.
 */
function importPrivateKey(rawBase64) {
  const rawKey = Buffer.from(rawBase64, 'base64');
  const pkcs8Der = Buffer.concat([X25519_PKCS8_PREFIX, rawKey]);
  return crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
}

/**
 * Generate a fresh X25519 keypair.
 * @returns {{ publicKey: string, privateKey: string, nonce: string }}
 *   All values are Base64. nonce is 32 random bytes for use in HKDF.
 */
function generateKeyPair() {
  const { privateKey: privObj, publicKey: pubObj } = crypto.generateKeyPairSync('x25519');

  // Export and extract raw 32-byte keys from DER wrappers
  const publicKeyRaw = pubObj.export({ type: 'spki', format: 'der' }).slice(-32);
  const privateKeyRaw = privObj.export({ type: 'pkcs8', format: 'der' }).slice(-32);
  const nonce = crypto.randomBytes(32);

  return {
    publicKey: publicKeyRaw.toString('base64'),
    privateKey: privateKeyRaw.toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

/**
 * Derive the shared AES key from ECDH + HKDF.
 * Both sides must call this with the same keys but swapped private/public.
 * @param {string} myPrivKeyB64  Our X25519 private key (raw 32 bytes, Base64)
 * @param {string} theirPubKeyB64 Their X25519 public key (raw 32 bytes, Base64)
 * @param {string} myNonceB64    Our nonce (32 bytes, Base64)
 * @param {string} theirNonceB64 Their nonce (32 bytes, Base64)
 * @returns {Buffer} 32-byte AES key
 */
function deriveKey(myPrivKeyB64, theirPubKeyB64, myNonceB64, theirNonceB64) {
  const privKey = importPrivateKey(myPrivKeyB64);
  const pubKey = importPublicKey(theirPubKeyB64);

  // ECDH shared secret
  const sharedSecret = crypto.diffieHellman({ privateKey: privKey, publicKey: pubKey });

  // XOR nonces for HKDF salt
  const myNonce = Buffer.from(myNonceB64, 'base64');
  const theirNonce = Buffer.from(theirNonceB64, 'base64');
  const salt = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    salt[i] = (myNonce[i] || 0) ^ (theirNonce[i] || 0);
  }

  return hkdf(sharedSecret, salt, Buffer.alloc(0), 32);
}

/**
 * Encrypt data for ABDM health information transfer.
 * @param {string} plaintext       JSON string to encrypt
 * @param {string} theirPubKeyB64  Requester's X25519 public key (Base64)
 * @param {string} theirNonceB64   Requester's nonce (Base64)
 * @returns {{ encryptedData: string, ourPublicKey: string, ourNonce: string }}
 */
function encrypt(plaintext, theirPubKeyB64, theirNonceB64) {
  const { publicKey: ourPubKey, privateKey: ourPrivKey, nonce: ourNonce } = generateKeyPair();
  const aesKey = deriveKey(ourPrivKey, theirPubKeyB64, ourNonce, theirNonceB64);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, ciphertext]);

  return {
    encryptedData: packed.toString('base64'),
    ourPublicKey: ourPubKey,
    ourNonce,
  };
}

/**
 * Decrypt data received from an ABDM health information push.
 * @param {string} encryptedDataB64 base64( iv[12] || authTag[16] || ciphertext )
 * @param {string} theirPubKeyB64   Sender's X25519 public key (Base64)
 * @param {string} theirNonceB64    Sender's nonce (Base64)
 * @param {string} ourPrivKeyB64    Our X25519 private key (Base64)
 * @param {string} ourNonceB64      Our nonce sent with the request (Base64)
 * @returns {string} decrypted plaintext
 */
function decrypt(encryptedDataB64, theirPubKeyB64, theirNonceB64, ourPrivKeyB64, ourNonceB64) {
  const aesKey = deriveKey(ourPrivKeyB64, theirPubKeyB64, ourNonceB64, theirNonceB64);

  const packed = Buffer.from(encryptedDataB64, 'base64');
  const iv = packed.slice(0, 12);
  const authTag = packed.slice(12, 28);
  const ciphertext = packed.slice(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { generateKeyPair, encrypt, decrypt };
