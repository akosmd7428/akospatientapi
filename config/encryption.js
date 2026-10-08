//import crypto from 'crypto';
const crypto = require('crypto');
const { DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_IV } = require('./secret');
// Define the encryption method and key
const algorithm = 'aes-256-cbc'; // AES-256 requires a 32-byte key
const key = DATA_ENCRYPTION_KEY; // 32 characters, from .env
const iv = DATA_ENCRYPTION_IV; // 16 bytes as hex, from .env
const ivBuffer = Buffer.from(iv, 'hex');
// Function to encrypt data
function encryptData(plaintext) {
   // console.log(plaintext);
    try{  
        const cipher = crypto.createCipheriv(algorithm, key, ivBuffer);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
       // console.log("after",encrypted);
        return { IV: ivBuffer.toString('hex'), encryptedData: encrypted }; // Return IV and encrypted data
    }catch(error){
       // console.log(error.message)
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


