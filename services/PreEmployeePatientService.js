const PreEmployeePatient = require('../models/preEmployeePatientModel');
const { toIdList } = require('../helpers/sqlSafe'); // SEC-006
const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const { APPOINTMENT_STATUS } = require('../config/secret');
const Medicine = require('../models/medicine');
const { Op } = require('sequelize');
const Patient = require('../models/patientModel');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const { sendSms } = require('./smsService');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');


class PreEmployeePatientService {
    static async getPreEmployeeList(companyId,status,searchQuery) {  
        let query = `
        SELECT *,           
            CASE 
                when pr.isActive = 1 then "Scheduled" 
                when pr.isActive = 2 then "Completed"
                when pr.isActive = 3 then "Pending"
                when pr.isActive = 4 then "Cancelled"
                when pr.isActive = 5 then "Rescheduled"
                when pr.isActive = 6 then "Report Generated"
                when pr.isActive = 7 then "Confirmed"
         END 
            as status
        FROM 
            preemployeepatient pr        
        WHERE 
            pr.companyId = :companyId`;
        if(status){
            query +=` AND pr.isActive = :status`;
        }       
        if(searchQuery){
            query += ` AND (pr.name LIKE :search)`;        
        } 
        query += ` ORDER BY pr.id desc`;
      try {
        const replacements = { 
            companyId,          
        };  
        if(status){
            replacements.status =  `${status}`;
        }
          if(searchQuery){       
            replacements.search =  `%${searchQuery}%`;
          }
          const result = await sequelizeDB1.query(query, {
          replacements,
          type: QueryTypes.SELECT,
        });      
        const response = result?result.map(result => ({
            id: result.id,
            name: result.name,
            email: result.email,
            phone: result.phone,
            gender: result.gender,
            age: result.age,
            dateofbirth: result.dateofbirth,
            zip_code: result.zip_code,
            type: result.type,
            report_url:result.report_url,
            status: result.status,
        })):{};
        return response;
      } catch (error) {    
        console.log(error);
        throw new Error('Error fetching preemployee detail1');
      }
    }
    // get status wise count
    static async getStatusWisePreEnroll(companyId,from_date,to_date){
        let query = `SELECT 
           count(pr.id) as count,
        CASE 
            when pr.isActive = 1 then  "Scheduled" 
            when pr.isActive = 2 then "Completed"
            when pr.isActive = 3 then "Pending"
            when pr.isActive = 4 then "Cancelled"
            when pr.isActive = 5 then "Rescheduled"
            when pr.isActive = 6 then "Report Generated"
            when pr.isActive = 7 then "Confirmed"
        END 
            as status
        FROM 
            preemployeepatient pr        
        WHERE 
            pr.companyId = :companyId AND pr.type = 'pre-enroll' `;

        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            query += ` AND pr.createdAt BETWEEN :fromDate AND :toDate `;
        } 
        query +=` GROUP by pr.isActive`;  
       // console.log(query);
        const replacements = {         
            companyId: companyId  // The doctor's ID
        };
        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            replacements.fromDate = from_date;
            replacements.toDate = to_date;
        }  
        try {    
            const result = await sequelizeDB1.query(query, {
                replacements,
              type: QueryTypes.SELECT,
            });
            return result;
        }catch(error){
            throw new Error('Error fetching data get status wise pre-employee detail');
        }     

    }  

    static async getStatusWiseAnual(companyId,from_date,to_date){
        let query = `SELECT 
           count(pr.id) as count,
        CASE 
            when pr.isActive = 1 then  "Scheduled" 
            when pr.isActive = 2 then "Completed"
            when pr.isActive = 3 then "Pending"
            when pr.isActive = 4 then "Cancelled"
            when pr.isActive = 5 then "Rescheduled"
            when pr.isActive = 6 then "Report Generated"
            when pr.isActive = 7 then "Confirmed"
        END 
            as status
        FROM 
            preemployeepatient pr        
        WHERE 
            pr.companyId = :companyId AND pr.type = 'anual'`;

        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            query += ` AND pr.createdAt BETWEEN :fromDate AND :toDate `;
        } 
        query +=` GROUP by pr.isActive`;  

        const replacements = {         
            companyId: companyId  // The doctor's ID
        };
        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            replacements.fromDate = from_date;
            replacements.toDate = to_date;
        } 
        try {    
            const result = await sequelizeDB1.query(query, {
                replacements,
              type: QueryTypes.SELECT,
            });
            return result;
        }catch(error){
            throw new Error('Error fetching data get status wise pre-employee detail');
        }     

    }

    static async getHraAssessment(companyId,year,searchQuery) {  
        let query = `
        SELECT 
           count(id) as count
        FROM 
            patient       
        WHERE 
            employer_id = :companyId AND  YEAR(patient.created_at) = :year
      `;  
      
      try {    
        const [result] = await sequelizeDB1.query(query, {
            replacements:{ companyId,year},
          type: QueryTypes.SELECT,
        });      
        let query1 = `
            SELECT 
                a.patientId, count(p.id) as c
            FROM
                patient as p  
            LEFT JOIN 
                assessmentResponse as a on p.id = a.patientId 
            WHERE 
                p.employer_id = :companyId AND YEAR(p.created_at) = :year`;
        if(searchQuery){
            query1 += ` AND (p.name LIKE :search OR CONCAT(p.first_name, ' ', p.last_name) LIKE :search)`;
        }
        query1 += ` GROUP BY a.patientId`;      
        const replacements = { 
             year,  // The year provided as input
            companyId,
        };
        if(searchQuery){
            replacements.search =  `%${searchQuery}%`;
        }
        const result2 = await sequelizeDB1.query(query1, {  
            replacements,
          type: QueryTypes.SELECT,
        }); 
       let count = result2.length;
       let tot = result.count;  
       let response = {
            total_employee:tot,
            hra_avail:count,
            hra_pending:tot - count
        }
        return response;
      } catch (error) {   
        console.log(error);
        throw new Error('Error fetching hra assesment detail');
      }
    }
    static async getEmpPendingHra(companyId,year,searchQuery) {  
        try {
            let queryUnavail = `
            SELECT 
            p.*,pd.profile_image
            FROM 
                patient as p 
            LEFT JOIN
                patientDetails as pd On p.id = pd.patientId    
            LEFT JOIN
                assessmentResponse as a ON a.patientId IS NULL
            WHERE 
                p.employer_id = :companyId`;

            if(searchQuery){
                queryUnavail += ` AND (p.name LIKE :search OR CONCAT(p.first_name, ' ', p.last_name) LIKE :search)`; 
            }            
            queryUnavail += ` AND YEAR(p.created_at) = :year`;
         
            const replacements = { 
                year,  // The year provided as input
                companyId, 
            };
            if (searchQuery) {
                replacements.search = `%${searchQuery}%`;
            }
            const resultUnAvail = await sequelizeDB1.query(queryUnavail, {   
                replacements,     
                type: QueryTypes.SELECT,
            });
            const responseAvail = resultUnAvail?resultUnAvail.map(result => ({
                employe_id: result.id,
                first_name: result.first_name,
                email: result.email,
                last_name: result.last_name,
                request_date: result.dateofbirth,
                schedule_date: result.dateofbirth,
                profile_image:result.profile_image,
                status: 1,
                remark:'book'          
            })):{};
            return responseAvail;
        } catch (error) {   
            console.log(error);
            throw new Error('Error fetching pending hra detail');
        }
    }
    // get month wise 
    static async getMonthWise(companyId,year){       
        try {
            const sqlMonth =`SELECT 
                DATE_FORMAT(a.createdAt, '%m') AS month,
                count(p.id) AS total_amount              
            FROM 
               patient as p
             LEFT JOIN 
                assessmentResponse as a on p.id = a.patientId 
            WHERE
                YEAR(a.createdAt) = :year AND p.employer_id=:companyId
            GROUP BY 
                month
            ORDER BY 
                month`;
                const replacements = {
                    year: year,  // The year provided as input
                    companyId: companyId  // The doctor's ID
                };
            const resultMonth = await sequelizeDB1.query(sqlMonth, {  
                replacements,      
                type: QueryTypes.SELECT,
            });
            const responseMonth = resultMonth?resultMonth.map(result => (
                {
                    count: result.total_amount,
                    month: result.month,                     
                }
            )):{};
            return responseMonth;
           
        } catch (error) {   
            console.log(error);
            throw new Error('Error fetching data month wise report detail');
        }

    }
    // no of employee
    static async getNoOfEmployeeTakenCall(companyId,from_date,to_date){
        let query = `
        SELECT 
           count(id) as count
        FROM 
            patient       
        WHERE 
            employer_id = :companyId
      `;  
      try {    
        const [result] = await sequelizeDB1.query(query, {
            replacements:{ companyId},
          type: QueryTypes.SELECT,
        });
        let query1 = ` 
            SELECT
                count(cc.id) callcont FROM connect_call_log as cc
            INNER JOIN 
                patient as p on cc.patient_id = p.id
            WHERE
                p.employer_id = :companyId`;
        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            query1 += ` AND cc.patient_connected_at BETWEEN :fromDate AND :toDate `;
        } 
        query1 +=`  GROUP BY
               cc.patient_id `;    
        const replacements = {         
            companyId: companyId  // The doctor's ID
        };
        if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
            replacements.fromDate = from_date;
            replacements.toDate = to_date;
        }       
        const result2 = await sequelizeDB1.query(query1, {  
            replacements,      
            type: QueryTypes.SELECT,
        });
        let count = result2.length;
        let tot = result.count;  
        let response = {
             total_employee:tot,
             call_taken:count,
             call_not_taken:tot-count           
         }
         return response;
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data call taken detail');
        }
    }
    // taken call by speciality
    static async getEmpCountBySpeciality(companyId,from_date,to_date){
        try {    
            let query = 
                `SELECT 
                    s.speciality_name,count(cc.patient_id) as cnt from connect_call_log as cc 
                    inner join 
                        patient as p on cc.patient_id = p.id 
                    left join 
                        doctor_speciality as ds on cc.doctor_id = ds.doctor_id 
                    inner join 
                        speciality as s on ds.speciality_id = s.id 
                        where cc.doctor_id !=0 AND p.employer_id=:companyId`;
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query += ` AND cc.patient_connected_at BETWEEN :fromDate AND :toDate `;
                }   
                query +=` group by s.id`;

            const replacements = {         
                companyId: companyId  // The doctor's ID
            };
            if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                replacements.fromDate = from_date;
                replacements.toDate = to_date;
            }   
      
            const result2 = await sequelizeDB1.query(query, {  
                replacements,      
                type: QueryTypes.SELECT,
            });
            return result2;
        }catch(error){
         //   console.log(error);
            throw new Error('Error fetching data speciallity wise detail');
        }
    }   
    // taken call by speciality
    static async getPatientCountForCardio(companyId,from_date,to_date){
        try {    
            let query = 
                `SELECT 
	                ar.id, ar.patientId, ar.response,ar.updatedAt
                FROM 
                    assessmentResponse ar
                JOIN 
                    assessments a ON ar.assessmentId = a.id
			    JOIN
				    patient as p on ar.patientId = p.id           
                WHERE 
                    ar.assessmentId = 6 AND p.employer_id =:companyId `;               
                // Check if from_date and to_date are provided
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query += ` AND ar.createdAt BETWEEN :fromDate AND :toDate `;
                }                     
			    query += `order by ar.id desc`;
                const replacements = {         
                    companyId: companyId, // The employer ID                 
                };
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    replacements.fromDate = from_date;
                    replacements.toDate = to_date;
                }
                console.log(replacements);
                const result = await sequelizeDB1.query(query, {  
                    replacements,      
                    type: QueryTypes.SELECT,
                });
               // console.log(result);
                const assessments = {};
                result.forEach(result => {
                    if (!assessments[result.patientId]) {
                        const response = result.response;
                        const jsonString = JSON.stringify(response);
                        const resObject = JSON.parse(jsonString);
                        assessments[result.patientId] = {
                        id:result.id,
                        percentage:resObject.percentage
                        };                     
                    }
                });               
                const data = assessments;             
                // Your JavaScript object
                // const data = {
                //     '16': { id: 263, percentage: 16 },
                //     '22': { id: 215, percentage: 10 },
                //     '23': { id: 215, percentage: 25 },
                //     '24': { id: 215, percentage: 30 },
                //     '25': { id: 215, percentage: 95 },
                //     '26': { id: 215, percentage: 40 },
                //     '27': { id: 215, percentage: 80 }
                // };  
                // Function to categorize percentages and count statuses  
                const statusCount = {};  
                // Iterate over each key in the object
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        const percentage = data[key].percentage; // Get the percentage value                
                        // Determine the status based on the percentage value
                        let status;
                        if (percentage < 20) {
                            status = 'low';
                        } else if (percentage > 20 && percentage <= 60) {
                            status = 'medium';
                        } else if (percentage > 60 && percentage <=90) {
                            status = 'High';
                        }else if (percentage > 90) {
                            status = 'Critical';
                        } else {
                            status = 'Low'; // For percentages between 50 and 70
                        }                
                        // Count the occurrences of each status
                        if (statusCount[status]) {
                            statusCount[status].count += 1; // Increment count if status already exists
                        } else {
                            statusCount[status] = { count: 1 }; // Initialize count for new status
                        }
                    }
                } 
           // return statusCount;
            // Convert the object to an array of objects
            const arrayOfStatusCounts = Object.entries(statusCount).map(([status, { count }]) => ({
                status: status,
                count: count
            }));  
        // Output the result            
        return arrayOfStatusCounts;
        }catch(error){
           console.log(error);
            throw new Error('Error fetching data cardio detail');
        }
    }
    // Daibetics function 
    static async getPatientCountForHyper(companyId,from_date,to_date){
        try {    
            let query = 
                `SELECT 
	                ar.id, ar.patientId, ar.response,ar.updatedAt
                FROM 
                    assessmentResponse ar
                JOIN 
                    assessments a ON ar.assessmentId = a.id
			    JOIN
				    patient as p on ar.patientId = p.id           
                WHERE 
                    ar.assessmentId = 1 and p.employer_id =:companyId `;
			   // Check if from_date and to_date are provided
               if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query += ` AND ar.createdAt BETWEEN :fromDate AND :toDate `;
                }                     
			    query += `order by ar.id desc`;
                const replacements = {         
                    companyId: companyId, // The employer ID
                  
                };
                if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                    replacements.fromDate = from_date;
                    replacements.toDate = to_date;
                }
                const result = await sequelizeDB1.query(query, {  
                    replacements,      
                    type: QueryTypes.SELECT,
                });
                //console.log(result);
                const assessments = {};
                result.forEach(result => {
                    if (!assessments[result.patientId]) {
                        const response = result.response;
                        const jsonString = JSON.stringify(response);
                        const resObject = JSON.parse(jsonString);
                        assessments[result.patientId] = {
                        id:result.id,
                        percentage:resObject.percentage
                        };                     
                    }
                });               
                const data = assessments;             
                // Your JavaScript object
                // const data = {
                //     '16': { id: 263, percentage: 16 },
                //     '22': { id: 215, percentage: 10 },
                //     '23': { id: 215, percentage: 25 },
                //     '24': { id: 215, percentage: 30 },
                //     '25': { id: 215, percentage: 95 },
                //     '26': { id: 215, percentage: 40 },
                //     '27': { id: 215, percentage: 80 }
                // };  
                // Function to categorize percentages and count statuses  
                const statusCount = {};  
                // Iterate over each key in the object
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        const percentage = data[key].percentage; // Get the percentage value                
                        // Determine the status based on the percentage value
                        let status;
                        if (percentage < 20) {
                            status = 'low';
                        } else if (percentage > 20 && percentage <= 60) {
                            status = 'medium';
                        } else if (percentage > 60 && percentage <=90) {
                            status = 'High';
                        }else if (percentage > 90) {
                            status = 'Critical';
                        } else {
                            status = 'Low'; // For percentages between 50 and 70
                        }                
                        // Count the occurrences of each status
                        if (statusCount[status]) {
                            statusCount[status].count += 1; // Increment count if status already exists
                        } else {
                            statusCount[status] = { count: 1 }; // Initialize count for new status
                            
                        }
                    }
                } 
               // Convert the object to an array of objects
                const arrayOfStatusCounts = Object.entries(statusCount).map(([status, { count }]) => ({
                    status: status,
                    count: count
                }));  
            // Output the result            
            return arrayOfStatusCounts;
        }catch(error){
           console.log(error);
            throw new Error('Error fetching data hyper detail');
        }
    }  
     // Daibetics function 
     static async getPatientCountForDaibetics(companyId,from_date,to_date){
        try {    
            let query = 
                `SELECT 
	                ar.id, ar.patientId, ar.response,ar.updatedAt
                FROM 
                    assessmentResponse ar
                JOIN 
                    assessments a ON ar.assessmentId = a.id
			    JOIN
				    patient as p on ar.patientId = p.id           
                WHERE 
                    ar.assessmentId = 2 and p.employer_id =:companyId `;
			    // Check if from_date and to_date are provided
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query += ` AND ar.createdAt BETWEEN :fromDate AND :toDate `;
                }                     
			    query += `order by ar.id desc`;
                const replacements = {         
                    companyId: companyId, // The employer ID
                  
                };
                if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                    replacements.fromDate = from_date;
                    replacements.toDate = to_date;
                }
                const result = await sequelizeDB1.query(query, {  
                    replacements,      
                    type: QueryTypes.SELECT,
                });
                //console.log(result);
                const assessments = {};
                result.forEach(result => {
                    if (!assessments[result.patientId]) {
                        const response = result.response;
                        const jsonString = JSON.stringify(response);
                        const resObject = JSON.parse(jsonString);
                        assessments[result.patientId] = {
                        id:result.id,
                        percentage:resObject.percentage
                        };                     
                    }
                });               
                const data = assessments;             
                // Your JavaScript object
                // const data = {
                //     '16': { id: 263, percentage: 16 },
                //     '22': { id: 215, percentage: 10 },
                //     '23': { id: 215, percentage: 25 },
                //     '24': { id: 215, percentage: 30 },
                //     '25': { id: 215, percentage: 95 },
                //     '26': { id: 215, percentage: 40 },
                //     '27': { id: 215, percentage: 80 }
                // };  
                // Function to categorize percentages and count statuses  
                const statusCount = {};  
                // Iterate over each key in the object
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        const percentage = data[key].percentage; // Get the percentage value                
                        // Determine the status based on the percentage value
                        let status;
                        if (percentage < 20) {
                            status = 'low';
                        } else if (percentage > 20 && percentage <= 60) {
                            status = 'medium';
                        } else if (percentage > 60 && percentage <=90) {
                            status = 'High';
                        }else if (percentage > 90) {
                            status = 'Critical';
                        } else {
                            status = 'Low'; // For percentages between 50 and 70
                        }                
                        // Count the occurrences of each status
                        if (statusCount[status]) {
                            statusCount[status].count += 1; // Increment count if status already exists
                        } else {
                            statusCount[status] = { count: 1 }; // Initialize count for new status
                        }
                    }
                } 
           // return statusCount;
            // Convert the object to an array of objects
            const arrayOfStatusCounts = Object.entries(statusCount).map(([status, { count }]) => ({
                status: status,
                count: count
            }));  
        // Output the result            
        return arrayOfStatusCounts;
        }catch(error){
          // console.log(error);
            throw new Error('Error fetching data daibetic detail');
        }
     }

    static async getEmployeeNewAdded(companyId){
        try {    
            const query = 
                `SELECT
                    count(p.id) as count
                FROM
                    patient as p
                WHERE
                    p.employer_id = :companyId AND p.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) 
                group by p.employer_id `;            

                const replacements = {         
                companyId: companyId  // The doctor's ID
            };
            const [result] = await sequelizeDB1.query(query, {  
                replacements,      
                type: QueryTypes.SELECT,
            });
          //  console.log(result);
            if(result){
               return result.count;
            }else{
                return 0;
            }
          
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data employee new added detail');
        }
    }
    // disable data
    static async getEmployeeDisable(companyId){
        try {    
            const query = 
                `SELECT
                    count(id) as count
                FROM
                    patient as p
                WHERE
                    p.employer_id = :companyId AND p.is_active = 0 
                group by employer_id `;            

                const replacements = {         
                companyId: companyId  // The doctor's ID
            };
            const [result] = await sequelizeDB1.query(query, {  
                replacements,      
                type: QueryTypes.SELECT,
            });
            //console.log(result);
            if(result){
              return  result.count;
            }else{
                return 0;
            }
        }catch(error){
          // console.log(error);
            throw new Error('Error fetching data employee disable detail');
        }
    }
    // in system  
    static async getEmployeeInSystem(companyId){
        try {    
            const query = 
                `SELECT
                    count(id) as count
                FROM
                    patient as p
                WHERE
                    p.employer_id = :companyId AND p.is_active = 1
                group by employer_id `;            

                const replacements = {         
                companyId: companyId  // The doctor's ID
            };
            const [result] = await sequelizeDB1.query(query, {  
                replacements,      
                type: QueryTypes.SELECT,
            });
           // return result?.result.count;
           if(result){
                return result.count;
            }else{
                return 0;
            }
        }catch(error){
         //   console.log(error);
            throw new Error('Error fetching data employee active detail');
        }
    }
    // get emp detaisl
    static async getEmployeeDetails(companyId,search, filter,status){    
            let query = `
                SELECT 
                   DISTINCT p.id AS patientId,
                    p.uniquePatientId,
                    CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                    p.phone,                               
                    pd.profile_image AS profilePic,                 
                    CASE 
                        WHEN p.is_active = 1 then "Active" 
                        WHEN p.is_active = 0 then "Disabled" 
                    END 
                        as status
                FROM 
                    patient p
                LEFT JOIN 
                    connectedCompaniesPatient ccp ON p.id = ccp.patientId            
                LEFT JOIN 
                    patientDetails pd ON p.id = pd.patientId               
                WHERE                  
                    p.employer_id = :companyId
            `;        
            // Add package filter if provided
            if (filter) {
                query += ` AND cp.id = :filter`;
            }        
            // Add search conditions if provided
            if (search) {
                query += ` AND (
                    p.uniquePatientId LIKE :search OR
                    CONCAT(p.first_name, ' ', p.last_name) LIKE :search                
                   
                )`;
            }
            if(status == 1){                
                query +=` AND p.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) AND p.is_active = 1`;
            }else if(status == 2){
                query +=` AND p.is_active = 0`;
            }else{
                query +=` AND p.is_active = 1`;
            } 
            console.log(status) ;         
            console.log(query);
           // const replacements = {};
            const replacements = {         
                companyId: companyId  // The doctor's ID
            };
        
            if (filter) {
                replacements.filter = filter;
            }
        
            if (search) {
                replacements.search = `%${search}%`;
            }
        
            const userDetails = await sequelizeDB1.query(query, {
                type: QueryTypes.SELECT,
                replacements,
            });
        
            return userDetails;
    }
    // update 
    static async enableDisableEmployeeStatus(companyId,patientId,status){
            try{ 
                const updateData = {
                    "is_active" : status           
                }
                console.log(updateData);
                console.log(patientId);
                // const data = await Patient.update(updateData, { 
                //     where: { id: patientId } 
                // });
                let query = ` update patient set is_active =:status where id=:patientId`;               
                const replacements = {
                    status:status,
                    patientId:patientId,                     
                }
                const [userDetails] = await sequelizeDB1.query(query, {
                    type: QueryTypes.update,
                    replacements,
                });
                return userDetails;
            }catch(error){
                console.log(error);
                throw new Error('Error fetching data employee active detail');
            }
    }
    // get company engagement details
    static async totalemp(companyId,from_date,to_date){
        try {  
            let query = `
                SELECT  
                count(p.id) as count
                FROM 
                    patient as p       
                WHERE 
                    employer_id = :companyId`; 
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query += ` AND p.created_at BETWEEN :fromDate AND :toDate `;
                }  
                const replacements = {         
                    companyId: companyId, // The employer ID                  
                };
                if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                    replacements.fromDate = from_date;
                    replacements.toDate = to_date;
                }
            const [result] = await sequelizeDB1.query(query, {
                replacements,
                type: QueryTypes.SELECT,
            });
            console.log(result);
            const totalEmp = result.count;
            return totalEmp;
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data employee total employee');
        }  
    }
    // taken call
    static async takenpatientcall(companyId,from_date,to_date){
          // taken call by the employee
          try{
                let query1 = ` 
                SELECT
                    count(cc.id) callcont FROM connect_call_log as cc
                INNER JOIN 
                    patient as p on cc.patient_id = p.id
                WHERE
                    p.employer_id = :companyId`;
                    if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                        query1 += ` AND cc.patient_connected_at BETWEEN :fromDate AND :toDate `;
                    }  
                    const replacements = {         
                        companyId: companyId, // The employer ID                  
                    };
                    if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                        replacements.fromDate = from_date;
                        replacements.toDate = to_date;
                    }
                query1 += ` GROUP BY
                    cc.patient_id`;    
                    const result2 = await sequelizeDB1.query(query1, {  
                        replacements,
                        type: QueryTypes.SELECT,
                    });
            // let empCallTaken = result2.callcont;
            let empCallTaken = result2?result2.length:0; 
            return empCallTaken;
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data employee taken call');
        }  
    }
    // taken assesment
    static async takenassesment(companyId,from_date,to_date){
        // taken assesment by employee
        try{
            let query3 = ` 
                SELECT
                    count(ar.patientId) assesCount FROM assessmentResponse as ar
                INNER JOIN 
                    patient as p on ar.patientId = p.id
                WHERE
                    p.employer_id = :companyId`;         
            
                if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                    query3 += ` AND ar.createdAt BETWEEN :fromDate AND :toDate `;
                }  
                query3 +=` GROUP BY
                        ar.patientId`;
                const replacements = {         
                    companyId: companyId, // The employer ID                  
                };
                if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                    replacements.fromDate = from_date;
                    replacements.toDate = to_date;
                }

            const result3 = await sequelizeDB1.query(query3, {  
                replacements,
                type: QueryTypes.SELECT,
            });
    // let assesmentTaken = result3.assesCount;
            let assesmentTaken = result3?result3.length:0;
            return assesmentTaken;
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data employee taken assesment detail');
        }  
    }
    // taken lab serveice
    static async takenLabBooking(companyId,from_date,to_date){        
        
            // taken lab service by employee
        try{
            let query4 = ` 
            SELECT
                count(labOrd.patientId) labBokCount FROM labOrders as labOrd
            INNER JOIN 
                patient as p on labOrd.patientId = p.id
            WHERE
                p.employer_id = :companyId
            `;             
            if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                query4 += ` AND labOrd.createdAt BETWEEN :fromDate AND :toDate `;
            }  
            query4 +=` GROUP BY
                    labOrd.patientId`;
            const replacements = {         
                companyId: companyId, // The employer ID                  
            };
            if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                replacements.fromDate = from_date;
                replacements.toDate = to_date;
            }
            
        const result4 = await sequelizeDB1.query(query4, {  
            replacements,
            type: QueryTypes.SELECT,
        });   
        let labBookTaken = result4?result4.length:0;  
        return labBookTaken;
        }catch(error){
            console.log(error);
            throw new Error('Error fetching data employee taken booking detail');
        }  
    }
    // unique 
    static async takenpatientcallUnique(companyId,from_date,to_date){
        // taken call by the employee
        try{
              let query1 = ` 
              SELECT
                  count(cc.id) callcont FROM connect_call_log as cc
              INNER JOIN 
                  patient as p on cc.patient_id = p.id
              WHERE
                  p.employer_id = :companyId`;
                  if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                      query1 += ` AND cc.patient_connected_at BETWEEN :fromDate AND :toDate `;
                  }  
                  const replacements = {         
                      companyId: companyId, // The employer ID                  
                  };
                  if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                      replacements.fromDate = from_date;
                      replacements.toDate = to_date;
                  }
              query1 += ` GROUP BY
                  cc.patient_id having callcont = 1`;    
                  const result2 = await sequelizeDB1.query(query1, {  
                      replacements,
                      type: QueryTypes.SELECT,
                  });
          // let empCallTaken = result2.callcont;
          let empCallTaken = result2?result2.length:0; 
          return empCallTaken;
      }catch(error){
          console.log(error);
          throw new Error('Error fetching data employee taken call');
      }  
  }
  // taken assesment
  static async takenassesmentUnique(companyId,from_date,to_date){
      // taken assesment by employee
      try{
          let query3 = ` 
              SELECT
                  count(ar.patientId) assesCount FROM assessmentResponse as ar
              INNER JOIN 
                  patient as p on ar.patientId = p.id
              WHERE
                  p.employer_id = :companyId`;         
          
              if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
                  query3 += ` AND ar.createdAt BETWEEN :fromDate AND :toDate `;
              }  
              query3 +=` GROUP BY
                      ar.patientId having assesCount = 1`;
              const replacements = {         
                  companyId: companyId, // The employer ID                  
              };
              if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
                  replacements.fromDate = from_date;
                  replacements.toDate = to_date;
              }

          const result3 = await sequelizeDB1.query(query3, {  
              replacements,
              type: QueryTypes.SELECT,
          });
  // let assesmentTaken = result3.assesCount;
          let assesmentTaken = result3?result3.length:0;
          return assesmentTaken;
      }catch(error){
          console.log(error);
          throw new Error('Error fetching data employee taken assesment detail');
      }  
  }
  // taken lab serveice
  static async takenLabBookingUnique(companyId,from_date,to_date){        
      
          // taken lab service by employee
      try{
          let query4 = ` 
          SELECT
              count(labOrd.patientId) labBokCount FROM labOrders as labOrd
          INNER JOIN 
              patient as p on labOrd.patientId = p.id
          WHERE
              p.employer_id = :companyId
          `;             
          if ((from_date !== undefined && from_date !== null) && (to_date !== undefined && to_date !==null)) {
              query4 += ` AND labOrd.createdAt BETWEEN :fromDate AND :toDate `;
          }  
          query4 +=` GROUP BY
                  labOrd.patientId having labBokCount =1`;
          const replacements = {         
              companyId: companyId, // The employer ID                  
          };
          if ((from_date !== undefined || from_date !== null) && (to_date !== undefined || to_date !==null)) {
              replacements.fromDate = from_date;
              replacements.toDate = to_date;
          }
          
      const result4 = await sequelizeDB1.query(query4, {  
          replacements,
          type: QueryTypes.SELECT,
      });   
      let labBookTaken = result4?result4.length:0;  
      return labBookTaken;
      }catch(error){
          console.log(error);
          throw new Error('Error fetching data employee taken booking detail');
      }  
  }

    static async getEmployeeEngagement(companyId,from_date, to_date){
        // total employee of the company\  
//         let serviceTaken = parseInt(empCallTaken) + parseInt(assesmentTaken) + parseInt(labBookTaken);
//         let notTake = totalEmp - serviceTaken;

//     // unique service avail  
//     // taken call by the employee
//     let query1U = ` 
//         SELECT
//             count(cc.id) callcont FROM connect_call_log as cc
//         INNER JOIN 
//             patient as p on cc.patient_id = p.id
//         WHERE
//             p.employer_id = :companyId
//         GROUP BY
//            cc.patient_id having callcont = 1`;    
//     const result2U = await sequelizeDB1.query(query1U, {  
//         replacements:{ companyId},
//         type: QueryTypes.SELECT,
//     });
//    // let empCallTaken = result2.callcont;
//     let empCallTakenU = result2U?result2U.length:0;   
//      // taken assesment by employee
//      let queryAssU = ` 
//         SELECT
//             count(ar.patientId) assesCount FROM assessmentResponse as ar
//         INNER JOIN 
//             patient as p on ar.patientId = p.id
//         WHERE
//             p.employer_id = :companyId
//         GROUP BY
//          ar.patientId having assesCount = 1`;
  
//     const resultAssU = await sequelizeDB1.query(queryAssU, {  
//         replacements:{ companyId},
//         type: QueryTypes.SELECT,
//     });
//    // let assesmentTaken = result3.assesCount;
//         let assesmentTakenU = resultAssU?resultAssU.length:0;   
//         // taken lab service by employee
//         let query4U = ` 
//         SELECT
//             count(labOrd.patientId) labBokCount FROM labOrders as labOrd
//         INNER JOIN 
//             patient as p on labOrd.patientId = p.id
//         WHERE
//             p.employer_id = :companyId
//         GROUP BY
//         labOrd.patientId having labBokCount = 1`;   
//     const result4U = await sequelizeDB1.query(query4U, {  
//         replacements:{ companyId},
//         type: QueryTypes.SELECT,
//     });   
//     let labBookTakenU = result4U?result4U.length:0; 
//         let unique  = {
//             callTaken : empCallTakenU,
//             assesmentTaken : assesmentTakenU,
//             labBookTaken : labBookTakenU
//         } 
//         let recuring = {
//             callTaken : empCallTaken,
//             assesmentTaken : assesmentTaken,
//             labBookTaken : labBookTaken
//         }   
//         let response = {
//             total:totalEmp,
//             notTaken : notTake,
//             recuring:recuring,
//             unique:unique
//         }
//         return response;
//         }catch(error){
//             console.log(error);
//             throw new Error('Error fetching data employee active detail');
//         }
    }

    // lab service 

    static async getPreEmploymentBookingDetails(companyId,status, search, filter,careCompanyIds) {
        try {
            let query = `
                SELECT
                   pe.id,pe.name,pe.phone,pe.gender,pe.age,pe.dateofbirth,pe.type,pe.health_check_up_date,report_url,report_remark,
                    CASE 
                        when pe.isActive = 1 then  "Scheduled" 
                        when pe.isActive = 2 then "Completed"
                        when pe.isActive = 3 then "Pending"
                        when pe.isActive = 4 then "Cancelled"
                        when pe.isActive = 5 then "Rescheduled"
                        when pe.isActive = 6 then "Report Generated"
                        when pe.isActive = 7 then "Confirmed"
                    END 
                    as status
                FROM 
                    preemployeepatient pe              
                WHERE 
                 pe.companyId IN (${toIdList(careCompanyIds, 'company id')})
               
            `;    
             // pe.companyId = :companyId 
            if(status){
                query += ` AND pe.isActive = :status`;
            }    
            // Add filtering based on the selected time range
            switch (filter) {
                case '1': // Last month
                    query += ` AND pe.health_check_up_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                    break;
                case '2': // Last 6 months
                    query += ` AND pe.health_check_up_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                    break;
                case '3': // Last 1 year
                    query += ` AND pe.health_check_up_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                    break;
                default:
                    break;
            }
            // Add search conditions if provided
            if (search) {
                query += ` AND (                   
                    CONCAT(pe.name) LIKE :search
                )`
            }

            query +=  ` ORDER BY pe.id desc `;
           
            const replacements = {
               // companyId:companyId,
         
            };
            replacements.status = status;
            if (search) {
                replacements.search = `%${search}%`;
            }
    
            const results = await sequelizeDB1.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });
    
            return results;
        } catch (error) {
            console.log(error);
            throw new Error(`Error fetching lab orders: ${error.message}`);
        }
    };
    // get details of the pre employee
    static async getPreempDetailsByEmail(email) {
        const preEmp = await Patient.findOne({
          where: { email },
          attributes: ['name', 'email', 'phone'],
        });
        
        if (!preEmp) {
          throw new Error('Employee not found');
        }
    
        return preEmp;
      } 
      
      static async updatePreLabReport(id, updateData, response) {
       // console.log(updateData);
        const result = await PreEmployeePatient.update(updateData, {
            where: { id: id }
        });
        const status = updateData.status;
        const orderDetail = await PreEmployeePatient.findOne({
            where: { id: id }
        });
        const Prepatient = await PreEmployeePatient.findOne({ where: { id: id } });
        if(status == "7"){ // Send Notifications
            const patientName = Prepatient.name;
            await emailHelperSMTP(Prepatient.id, Prepatient.email, 'Lab Booking Confirmed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been successfully confirmed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
           
        }
        if(status == "4"){ // Send Notifications
            const patientName = Prepatient.name;
            await emailHelperSMTP(Prepatient.id, patient.email, 'Lab Booking Cancelled', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been cancelled.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
          
        }
        if(status == "2"){ // Send Notifications
            const patientName = Prepatient.name;
            await emailHelperSMTP(Prepatient.id, patient.email, 'Lab Booking Completed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been Completed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
          
        }
        if(status == "6"){ // Send Notifications
            const patientName = Prepatient.name;
            await emailHelperSMTP(Prepatient.id, patient.email, 'Lab Booking Report Generated', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking Report has been Generated.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
           
        }
        return result;
    }
    //
    
     static async getUserModule(userId) {
        try {      
            const query = `
                SELECT 
                    mp.module_id,
                    mp.user_id, 
                    mp.permission_view, 
                    mp.permission_edit,              
                    m.module_name, 
                    u.id AS user_id, 
                    u.name
                FROM 
                    hr_module_permission mp
                JOIN 
                    hr_module m ON m.id = mp.module_id  -- Assuming there is a foreign key relationship
                JOIN 
                    hr u ON u.id = mp.user_id
                WHERE 
                    u.id = :userId  -- Use a parameterized query to prevent SQL injection
                ORDER BY 
                    mp.id DESC;
            `;
            const results = await sequelizeDB1.query(query, {
                replacements: { userId: userId },  // Use replacements for parameterized queries
                type: sequelizeDB1.QueryTypes.SELECT  // Specify the query type
            });
            // Check if results is an array and has elements
            if (Array.isArray(results) && results.length > 0) {
                return results;   
            } else {
                return null;  // Return null if no results found
            }
        } catch (error) {
            throw new Error('Unable to fetch user details');
        } 
     }
   static async getUserComanies(userId) {
        try {      
            const query = `
                SELECT 
                u.companyId
                FROM 
                hr u            
                WHERE 
                    u.id = :userId  -- Use a parameterized query to prevent SQL injection
            ;
            `;
            const results = await sequelizeDB1.query(query, {
                replacements: { userId: userId },  // Use replacements for parameterized queries
                type: sequelizeDB1.QueryTypes.SELECT  // Specify the query type
            });
        
            // Check if results is an array and has elements
            if (Array.isArray(results) && results.length > 0) {
                const companyId = results[0].companyId;
                const companyArr = companyId.split(",")
             //   console.log(companyArr);
            const query_company = `
                    SELECT 
                        c.id,
                        c.company_name
                    FROM 
                        worksman_company_list c            
                    WHERE 
                        c.id IN (:companyArr);  -- Use a parameterized query to prevent SQL injection
                    `;                  
                    const results_company = await sequelizeDB1.query(query_company, {
                    replacements: { companyArr: companyArr },  // Use replacements for parameterized queries
                    type: sequelizeDB1.QueryTypes.SELECT  // Specify the query type
                    });
              //  console.log(results_company);
                    return results_company; // Return the results    
            } else {
                return null;  // Return null if no results found
            }
        } catch (error) {
            throw new Error('Unable to fetch user details');
        }   
    }

}
module.exports = PreEmployeePatientService;
