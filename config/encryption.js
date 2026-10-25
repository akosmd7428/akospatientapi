//import crypto from 'crypto';
const crypto = require('crypto');
const { DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_IV, ALGORITHM } = require('./secret');
// Define the encryption method and key
const algorithm = ALGORITHM; // AES-256 requires a 32-byte key
const key = DATA_ENCRYPTION_KEY; // 32 characters, from .env
const iv = DATA_ENCRYPTION_IV; // 16 bytes as hex, from .env
const ivBuffer = Buffer.from(iv, 'hex');
console.log('algo',algorithm);
console.log('key',key);
console.log('iv',iv);
// Function to encrypt data
function encryptData(plaintext) {
    console.log(plaintext);
    try{ 
        if (key.length !== 32) {
            throw new Error('AES-256 requires a 32-byte key');
        }

        if (ivBuffer.length !== 16) {
            throw new Error('AES-256-CBC requires a 16-byte IV');
        } 
        const cipher = crypto.createCipheriv(algorithm, key, ivBuffer);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        console.log("after",encrypted);
        return { IV: ivBuffer.toString('hex'), encryptedData: encrypted }; // Return IV and encrypted data
    }catch(error){
        console.log(error.message)
    }
}

// Function to decrypt data
function decryptData(encryptedData, iv) {  
   // ivBufferD = Buffer.from(iv, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));   
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');  
    return decrypted;
}

module.exports = {
    encryptData,decryptData
};


