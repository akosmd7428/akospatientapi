const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const moment = require('moment');
const VitalMonitoring = require('../models/vitalMonitoringModel');
const VitalMonitoringComment = require('../models/vitalMonitoringCommentModel');
const NotificationService = require('./notificationService');

class VitalMonitoringService {

    // get device
    static async getDeviceDetails(){
         let query = `
            SELECT 
                d.id,
                d.device_name,
                d.normal_range, 
                vp.id as colmId,
                vp.key_name,
                vp.label,
                vp.placeholder,
                vp.type,
                vp.maxLength                
            FROM 
               health_checkup_device d  
            JOIN
               vital_device_param as vp  
            ON
                d.id = vp.device_id        
            WHERE 
                d.status = 1 AND vp.status = 1
        `;
        const devicelist = await sequelizeDB1.query(query, {         
            type: QueryTypes.SELECT
        });
        const grouped = {};    
        devicelist.forEach(item => {
            if (!grouped[item.id]) {
                grouped[item.id] = {
                    id: item.id,
                    device_name: item.device_name,
                    normal_range: item.normal_range,
                    fields: []
                };
            }
            grouped[item.id].fields.push({
                field_id: item.colmId,
                key: item.key_name.trim(),
                label: item.label,
                placeholder: item.placeholder,
                type: item.type,
                maxLength: item.maxLength
            });
        });      
        const sections = Object.values(grouped);
        return sections;
    } 
    // get device monitoring result
     static async getDeviceMonitoring(patient_id){
         let query = `
            SELECT 
                v.id,
                v.param_value,
                v.device_id,
                hd.device_name,
                hd.normal_range,
                v.param_key_name,
                v.param_key_id,
                DATE_FORMAT(v.createdAt, '%d %b, %Y %h:%i %p' ) AS createdAt,          
                v.is_manual
            FROM 
                vital_patient_monitoring AS v
            JOIN 
                vital_device_param AS vp ON v.device_id = vp.device_id
            JOIN 
                health_checkup_device AS hd ON vp.device_id = hd.id
            JOIN (
                SELECT param_key_id, MAX(id) AS max_id
                FROM vital_patient_monitoring
                where patient_id = :patient_id
                GROUP BY param_key_id
            ) latest ON v.id = latest.max_id
            WHERE 
                hd.status = 1 AND vp.status = 1 AND v.patient_id = :patient_id
            group by v.id
            ORDER BY v.id DESC
        `;

        const replacements = { 
             patient_id
        };

        const devicelist = await sequelizeDB1.query(query, {    
             replacements,     
            type: QueryTypes.SELECT
        });
        const grouped = {};    
        
      
        devicelist.forEach(item => {
            if (!grouped[item.device_id]) {
                grouped[item.device_id] = {
                    device_id: item.device_id,
                    param_key_id: item.id,
                    device_name: item.device_name,
                    normal_range: item.normal_range,
                    date: item.createdAt,
                    is_manual:item.is_manual,
                    fields: []
                };
            }
            grouped[item.device_id].fields.push({
                param_key_name:item.param_key_name.trim(),
                value: item.param_value,
               
            });
        });          
        const sections = Object.values(grouped);             
        return sections;
    }
    // create device monitoring records
    static async createDeviceMonitoring(data,patient_id){
       // console.log(data);
        await this.createDeviceNotification(data,patient_id);
        await this.createDeviceNotificationForCareNavigator(data,patient_id);
        return await VitalMonitoring.bulkCreate(data);
    } 
    // get monitoring details
    static async getVitalMonitoringDetails(patient_id,device_id, from_date, to_date){
        
         let query = `
            SELECT 
                v.id,  
                hd.device_name, 
                v.param_key_name,
                v.param_value,               
                DATE_FORMAT(v.createdAt, '%d-%m-%Y' ) AS date 
            FROM 
                vital_patient_monitoring AS v         
            JOIN 
                health_checkup_device AS hd ON v.device_id = hd.id           
            WHERE 
                v.status = 1 AND hd.status = 1 AND v.patient_id = :patient_id  AND v.device_id =:device_id
            `;
            if(from_date!='' && to_date!=''){
                query +=` AND (v.createdAt BETWEEN :from_date AND DATE_ADD(:to_date, INTERVAL 1 DAY))`;
            }      
            query +=` ORDER BY v.id ASC`;

        // const replacements = { 
        //     patient_id,
        //     device_id,
        // };

        const replacements = {
        patient_id: patient_id,
        device_id: device_id,
      
    }

        if (from_date !== '' && to_date !== '') {
            replacements.from_date = from_date;
            replacements.to_date = to_date;
        }
        //console.log(query);

        const devicelist = await sequelizeDB1.query(query, {    
            replacements,           
            type: QueryTypes.SELECT
        });
        const result = [];
        const map = {};      

        devicelist.forEach(item => {
        const date = item.date;
        const key = item.param_key_name.trim(); // remove any trailing spaces
        const value = item.param_value;

        if (!map[date]) {
            map[date] = { date };
            result.push(map[date]);
        }
            map[date][key] = value;
        });
        const device_name = devicelist[0]?.device_name || null;
        const device_id_ss = devicelist[0]?.device_id || null;
       // console.log(result);
       const data = {
        device_name,  
        result
       }
        return data;

    }

    // get device comment
    static async getDeviceComment(patient_id,device_id){
         let query = `
            SELECT 
                vc.comment
            FROM 
                vital_monitoring_comment vc  
            WHERE 
                vc.status = 1 AND vc.patient_id = :patient_id  AND vc.device_id =:device_id
            `;
            query +=` ORDER BY vc.id DESC limit 0,1
        `;

        const replacements = { 
            patient_id,
            device_id,
        };
        const devicelist = await sequelizeDB1.query(query, {    
            replacements,           
            type: QueryTypes.SELECT
        });
        return devicelist;
    }
    // post device comment records
    static async postDeviceComment(data){
       // console.log(data);
         return await VitalMonitoringComment.create(data);
    } 
    // create notification
    static async createDeviceNotification(data,patient_id){
          data.forEach(item =>{
            if(item.device_id == 1 ){                
                if((item.param_key_name == 'systolic' && (item.param_value >= 140 || item.param_value < 100))){
                        let deviceNotifyData = {
                        "title" : "Blood Pressure Monitor reading violating ",
                        "description": `The value of the systolic is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }

                if( (item.param_key_name == 'diastolic' && (item.param_value  >= 90 || item.param_value  < 60))){
                        let deviceNotifyData = {
                        "title" : "Blood Pressure Monitor reading violating ",
                        "description": `Diastolic reading value is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }
            //
            if(item.device_id == 2 ){                
                if(item.param_key_name == 'sugar' && (item.param_value < 70 || item.param_value > 160)){
                        let deviceNotifyData = {
                        "title" : "Glucometer reading violating ",
                        "description": `The value of the `+item.param_key_name+` is  `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }
            if(item.device_id == 3 ){                
                if(item.param_key_name == 'spo2' && item.param_value < 90 ){
                        let deviceNotifyData = {
                        "title" : "Pulse Oximeter reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }
            if(item.device_id == 4 ){                
                if(item.param_key_name == 'prbpm' && (item.param_value > 110 || item.param_value < 50)){
                        let deviceNotifyData = {
                        "title" : "Heart Rate Monitor reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }
            if(item.device_id == 5 ){                
                if(item.param_key_name == 'weight' && (item.param_value < 40 || item.param_value > 120)){
                        let deviceNotifyData = {
                        "title" : "Weight Scale reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }
             if(item.device_id == 6 ){                
                if(item.param_key_name == 'temperature' && (item.param_value > 100 || item.param_value < 97)){
                        let deviceNotifyData = {
                        "title" : "Thermometer reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }

             if(item.device_id == 7 ){                
                if(item.param_key_name == 'cholesterol' &&  item.param_value > 220){
                        let deviceNotifyData = {
                        "title" : "Cholesterol Meter reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }

             if(item.device_id == 8 ){                
                if(item.param_key_name == 'bmi' && (item.param_value < 18 || item.param_value > 29)){
                        let deviceNotifyData = {
                        "title" : "BMI Analyzer reading violating ",
                        "description": `The value of the `+item.param_key_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": item.patient_id,
                        "role" : "patient"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                }
            }

        });
    }
    // notification for the careNavigator respective to the patient.

      static async createDeviceNotificationForCareNavigator(data,patient_id){
        //get company and details information of the patient.
        let query = `
            SELECT 
                p.employer_id,
                p.first_name,
                p.last_name,
                wc.company_name
            FROM 
                patient p 
            JOIN
               worksman_company_list as wc
            ON
               p.employer_id = wc.id
            WHERE 
                p.id = :patient_id limit 0,1
            `;         

        const replacements = { 
            patient_id          
        };
        const patientDetails = await sequelizeDB1.query(query, {    
            replacements,           
            type: QueryTypes.SELECT
        });       
        if(!patientDetails){
           // return false;
        }
       let queryCare = `
            SELECT 
                c.id               
            FROM 
                carenavigator c             
            WHERE 
                c.companyId IN (:employer_id)
            
        `;
        const employer_id = patientDetails[0].employer_id;
        const company_name = patientDetails[0].company_name;        
        const patient_name = patientDetails[0].first_name+" "+patientDetails[0].last_name; 
        const replacementsCare = { 
            employer_id: Array.isArray(employer_id) ? employer_id : [employer_id]
        };      
        const careNavDetails = await sequelizeDB1.query(queryCare, {    
            replacements: replacementsCare,
            type: QueryTypes.SELECT
        });      
          data.forEach(item =>{
            if(item.device_id == 1 ){                
                if((item.param_key_name == 'systolic' && (item.param_value >= 140 || item.param_value < 100))){
                        careNavDetails.forEach(itemCare=>{                   
                            let deviceNotifyData = {
                            "title" : "Blood Pressure Monitor reading violating ",
                            "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                            "referenceId": itemCare.id,
                            "role" : "careNavigator"
                        }                    
                        NotificationService.createNotification(deviceNotifyData);
                    });
                }

                if( (item.param_key_name == 'diastolic' && (item.param_value  >= 90 || item.param_value  < 60))){
                    careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Blood Pressure Monitor reading violating ",
                        "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }
            //
            if(item.device_id == 2 ){                
                if(item.param_key_name == 'sugar' && (item.param_value < 70 || item.param_value > 160)){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Glucometer reading violating ",
                         "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                         "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                     });
                }
            }
            if(item.device_id == 3 ){                
                if(item.param_key_name == 'spo2' && item.param_value < 90 ){
                    careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Pulse Oximeter reading violating ",
                      "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                        "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }
            if(item.device_id == 4 ){                
                if(item.param_key_name == 'prbpm' && (item.param_value > 110 || item.param_value < 50)){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Heart Rate Monitor reading violating ",
                       "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                       "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }
            if(item.device_id == 5 ){                
                if(item.param_key_name == 'weight' && (item.param_value < 40 || item.param_value > 120)){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Weight Scale reading violating ",
                       "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                       "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }
             if(item.device_id == 6 ){                
                if(item.param_key_name == 'temperature' && (item.param_value > 100 || item.param_value < 97)){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Thermometer reading violating ",
                       "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                       "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }

             if(item.device_id == 7 ){                
                if(item.param_key_name == 'cholesterol' &&  item.param_value > 220){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "Cholesterol Meter reading violating ",
                        "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                       "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                    });
                }
            }

             if(item.device_id == 8 ){                
                if(item.param_key_name == 'bmi' && (item.param_value < 18 || item.param_value > 29)){
                     careNavDetails.forEach(itemCare=>{ 
                        let deviceNotifyData = {
                        "title" : "BMI Analyzer reading violating ",
                        "description": `The value of the `+item.param_key_name+` of `+patient_name+` for `+company_name+` is `+item.param_value+`, this is violating the normal value.`,
                       "referenceId": itemCare.id,
                        "role" : "careNavigator"
                    }                    
                    NotificationService.createNotification(deviceNotifyData);
                });
                }
            }

        });
    }

     static async getPatientDeviceRating(patient_id){
         let query = `
            SELECT 
                v.id,
                v.param_value,
                v.device_id,
                hd.device_name,
                hd.normal_range,
                v.param_key_name,
                v.param_key_id,
                DATE_FORMAT(v.createdAt, '%d %b, %Y %h:%i %p' ) AS createdAt,          
                v.is_manual
            FROM 
                vital_patient_monitoring AS v
            JOIN 
                vital_device_param AS vp ON v.device_id = vp.device_id
            JOIN 
                health_checkup_device AS hd ON vp.device_id = hd.id
            JOIN (
                SELECT param_key_id, MAX(id) AS max_id
                FROM vital_patient_monitoring
                where patient_id = :patient_id
                GROUP BY param_key_id
            ) latest ON v.id = latest.max_id
            WHERE 
                hd.status = 1 AND vp.status = 1 AND v.patient_id = :patient_id
            group by v.id
            ORDER BY v.id DESC
        `;

        const replacements = { 
             patient_id
        };

        const devicelist = await sequelizeDB1.query(query, {    
             replacements,     
            type: QueryTypes.SELECT
        });
        const grouped = {};         
        devicelist.forEach(item => {
            // if (!grouped[item.param_key_name]) {
            //     grouped[item.param_key_name] = {
            //         param_key_name: item.param_value,  
            //     };
            // } 
            if(item.param_key_name == 'spo2'){
                 grouped.spo2 = item.param_value;      
            }
             if(item.param_key_name == 'sugar'){
                 grouped.sugar = item.param_value;      
            }
            if(item.param_key_name == 'diastolic'){
                 grouped.diastolic = item.param_value;      
            }
            if(item.param_key_name == 'systolic'){
                 grouped.systolic = item.param_value;      
            }
            if(item.param_key_name == 'cholesterol'){
                 grouped.cholesterol = item.param_value;      
            }
            if(item.param_key_name == 'temperature'){
                 grouped.temperature = item.param_value;      
            }
            if(item.param_key_name == 'heartRate'){
                 grouped.heartRate = item.param_value;      
            }
           
        });      
        return grouped;
    }

    /*
            const helthArr = {};
            devicelist.forEach(item => {
                if(item.device_id == 1){
                    const f = helthArr.fields;
                    f.forEach(item => {
                            
                        }
                    )
                }   
            });
    */

}

module.exports = VitalMonitoringService;
