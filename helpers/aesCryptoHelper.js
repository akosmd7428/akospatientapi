const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const ivLength = 16; // Initialization vector length in bytes

// Function to encrypt data
const aesEncrypt = (data, fields) => {
    const key = process.env.AES_SECRET_KEY || 'a2f4d8e1e3c4b4d798f9a0d536ec86a054f7a69c9b79d8c4f2f3a7a9ff582a73';
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return { iv: iv.toString('hex'), encryptedData: encrypted };
};

// Function to decrypt data
const aesDecrypt = (encryptedData, iv) => {
    const key = process.env.AES_SECRET_KEY || 'a2f4d8e1e3c4b4d798f9a0d536ec86a054f7a69c9b79d8c4f2f3a7a9ff582a73';
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
};

module.exports = { aesEncrypt, aesDecrypt };
