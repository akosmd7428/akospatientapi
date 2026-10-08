const crypto = require('crypto');
const { AES_SECRET_KEY } = require('../config/secret');
const algorithm = 'aes-256-cbc';
const ivLength = 16; // Initialization vector length in bytes

// Function to encrypt data
const aesEncrypt = (data, fields) => {
    const key = AES_SECRET_KEY;
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return { iv: iv.toString('hex'), encryptedData: encrypted };
};

// Function to decrypt data
const aesDecrypt = (encryptedData, iv) => {
    const key = AES_SECRET_KEY;
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
};

module.exports = { aesEncrypt, aesDecrypt };
