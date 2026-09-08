const { encryptData,decryptData } = require('../config/encryption');
class CommonHelper {
    static sendErrorUnencrypt(res, statusCode, message, errors = []) {
        res.status(statusCode).json({
            success: false,
            message,
            errors
        });
    }

    static sendSuccessUnencrypt(res, data, statusCode, message, additionalData = {}) {   
       res.status(statusCode).json({
            success: true,
            message,
            data,
            ...additionalData
        });  
    }

    static sendSuccess(res, data, statusCode, message, additionalData = {}) { 
        // additionalData = JSON.stringify(additionalData);
         let dataJson = { success: true,
             message,
             data,
             ...additionalData
         }
        // console.log("datajson",dataJson);
         additionalData = JSON.stringify(dataJson);
         let encryted = encryptData(additionalData)
         let encryptedData = encryted.encryptedData;
         let IV = encryted.IV;      
         res.status(statusCode).json({
                 encryptedData,
                 IV               
             });
     }
     static sendError(res, statusCode, message, errors = []) {

        let dataJson = { 
            success: false,
            message,
            errors
        }

        let additionalData = JSON.stringify(dataJson);
        let encryted = encryptData(additionalData)
        let encryptedData = encryted.encryptedData;
        let IV = encryted.IV;      
        res.status(statusCode).json({
                encryptedData,
                IV               
            });

        // res.status(statusCode).json({
        //     success: false,
        //     message,
        //     errors
        // });
    }

    static sendEncryptData(res, data, statusCode, message, additionalData = {}) {  
        //console.log(additionalData);
        let encryted = encryptData(JSON.stringify(additionalData));
        //console.log(encryted);
        res.status(statusCode).json({
             success: true,
             message,
             data,
             encryted
         });  
     }

     static generateUuidV4() {
            const crypto = require('crypto');

            const bytes = crypto.randomBytes(16);

            // Set version (UUIDv4): xxxx-xx4x-xxxx
            bytes[6] = (bytes[6] & 0x0f) | 0x40;

            // Set variant (RFC 4122): xxxxxxxx-xxxx-xxxx-8xxx-xxxxxxxxxxxx
            bytes[8] = (bytes[8] & 0x3f) | 0x80;

            const hex = bytes.toString('hex');

            return (
                hex.slice(0, 8) + '-' +
                hex.slice(8, 12) + '-' +
                hex.slice(12, 16) + '-' +
                hex.slice(16, 20) + '-' +
                hex.slice(20)
            );
    }

    static generateVerificationLink(userId, baseUrl) {
        // Create token valid for 1 day
        const token = jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: "1d" } // expires in 1 day
        );
        // Construct verification URL
        const verificationLink = `${baseUrl}/verify-email?token=${token}`;
        return verificationLink;
    }

    // resolve the caller ip, the api is served behind a proxy so x-forwarded-for wins
    static getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        let ip = '';

        if (forwarded) {
            ip = forwarded.split(',')[0].trim();
        } else {
            ip = req.headers['x-real-ip'] || req.ip || (req.connection && req.connection.remoteAddress) || '';
        }
        // strip the ipv4 mapped ipv6 prefix (::ffff:127.0.0.1) and the ipv6 loopback
        ip = String(ip).replace(/^::ffff:/i, '');

        return ip === '::1' ? '127.0.0.1' : ip;
    }

    // match an ip against a stored whitelist, entries can be separated by comma, semicolon, space or new line
    static isIpWhitelisted(ip, whitelist) {
        if (!whitelist) {
            return false;
        }
        const allowedIps = String(whitelist)
            .split(/[\s,;]+/)
            .map(entry => entry.replace(/^::ffff:/i, '').trim())
            .filter(entry => entry.length > 0);

        if (allowedIps.length === 0) {
            return false;
        }
        if (allowedIps.includes('*')) {
            return true;
        }
        return allowedIps.includes(ip);
    }

    // constant time comparison for secrets so the response time does not leak the value
    static secureCompare(value, expected) {
        const crypto = require('crypto');

        if (typeof value !== 'string' || typeof expected !== 'string') {
            return false;
        }
        const valueBuffer = Buffer.from(value);
        const expectedBuffer = Buffer.from(expected);
        console.log(valueBuffer);
        if (valueBuffer.length !== expectedBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
    }


//     const valid = crypto.timingSafeEqual(
//     Buffer.from(company.client_secret),
//     Buffer.from(clientSecret)
// );

}

module.exports = CommonHelper;
