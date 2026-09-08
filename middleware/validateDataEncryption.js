const { encryptData,decryptData } = require('../config/encryption');

const validateDataEncryption = () => {
  return (req, res, next) => {      
      if (Object.keys(req.params).length != 0) {
       
        if(req.params.encryptedData != null){
          data = decryptData(req.params.encryptedData,req.params.IV);
          req.params = JSON.parse(data);
        }else{
         // console.log("shs");
        }       
        //console.log("hds",req.params);
      } 
      if (Object.keys(req.body).length != 0) {
        data = decryptData(req.body.encryptedData,req.body.IV);
        req.body = JSON.parse(data);       
      }
      if (Object.keys(req.query).length != 0) {
        data = decryptData(req.query.encryptedData,req.query.IV);
        req.query = JSON.parse(data);      
      }
    next();
  };
};

module.exports = validateDataEncryption;