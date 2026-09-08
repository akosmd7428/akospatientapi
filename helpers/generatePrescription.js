const { generatePdf } = require('./generatePdf'); // Ensure you have this utility
const { sendSms } = require('../services/smsService');
const { emailHelper } = require('../helpers/emailHelper'); // Adjust the path as needed
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP'); // Adjust the path as needed
const PatientService = require('../services/patientService');
const { shortenUrl } = require('../services/bitlyService');

const generatePrescription = async (data) => {
    const { 
        details, 
        medicines 
    } = data;
    // Create HTML content for the PDF
    // Header Content
    const headerContent = `
    <section style="width: 100%; height: auto; border-bottom: 2px solid #444;">
        <table class="table table-striped" style="width:100%;">
            <tbody>
                <tr>
                    <td align="left" style="text-align:left;width:10%;">
                        <img width="150px" src="https://patientportalapi.akosmd.in/assets/akosLogo.png" alt="logo">
                    </td>
                    <td style="width:40%;"></td>
                    <td align="right" style="text-align:right;width:50%;">
                        <h3 style="color: #444; font-size: 16px; font-weight: 400; margin: 8px 0;">
                            <strong>Prescription No.:</strong> ${details.prescriptionUniqueId}
                        </h3>
                        <h3 style="color: #444; font-size: 16px; font-weight: 400; margin: 8px 0;">
                            <strong>Prescription Date:</strong> ${new Date().toISOString().split('T')[0]}
                        </h3>
                    </td>
                </tr>
            </tbody>
        </table>
    </section>
    `;

    // Footer Content
    const footerContent = `
    <footer style="position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            display: flex;
            justify-content: space-between;
            padding: 0px;
            padding-left: 10px;
            padding-right: 10px;
            background-color: #0d0d11;">
        <table class="table table-striped" style="width:100%;">
            <tbody>
                <tr>
                    <td align="center" style="text-align:center;width:100%;"> 
                        <p style="text-align: center; color: #fff; font-weight: 400; margin-left: 5px; margin: 5px 0; font-size: 10px;">
                            <strong>Akos MD Technologies Pvt. Ltd.</strong>
                        </p>
                        <p style="text-align: center; color: #fff; font-weight: 400; font-size: 10px;">
                            <strong>Regd. Office:</strong> F-98, Ground Floor, Lajpat Nagar II, New Delhi 110024
                        </p>
                         <p style="text-align: center; color: #fff; font-weight: 400; font-size: 10px;">
                            <strong>Corporate Office:</strong> Smartworks Corporate Park, Maple Tower, Sector 125, Noida, 201303
                        </p>
                        <p style="text-align: center; color: #fff; font-weight: 400; font-size: 10px;">
                            <strong>E :</strong> <a href="mailto:support@akosmd.in">support@akosmd.in</a>, 
                            <strong>W :</strong> <a href="https://www.akosmd.in" target="_blank">www.akosmd.in</a>, 
                            <strong>Mb :</strong> +91-8595461929
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="left" style="text-align:left;width:100%; color:#fff;"> 
                        <small style="color: #000;font-weight: 400;"><strong>Note:</strong> This prescription is generated on a teleconsultation.</small>
                    </td>
                </tr>
            </tbody>
        </table>
        </footer>
    `;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AKOS Patient Prescription</title>
    </head>
    <body style="margin: 0;
                padding: 0 20px;
                box-sizing: border-box;
                font-size: 16px;
                position: relative;
                min-height: 100%;
                padding-bottom: 170px;">
        <section style="max-width: 100%; min-height: calc(100vh - 177px); height: auto; padding: 0px;">
            <section style="width: 100%; height: auto; border-bottom: 2px solid #444;">
                <table class="table table-striped" style="width:100%;">
                    <tbody>
                        <tr>
                            <td align="left" style="text-align:left;width:10%;">
                                <img width="180px" src="https://patientportalapi.akosmd.in/assets/akosLogo.png" alt="logo">
                            </td>
                            <td style="width:40%;"></td>
                            <td align="right" style="text-align:right;width:50%;">
                                <h3 style="color: #444; font-size: 16px; font-weight: 400; margin: 8px 0;">
                                    <strong>Prescription No.:</strong> ${details.prescriptionUniqueId}
                                </h3>
                                <h3 style="color: #444; font-size: 16px; font-weight: 400; margin: 8px 0;">
                                    <strong>Prescription Date:</strong> ${new Date().toISOString().split('T')[0]}
                                </h3>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <section style="width: 100%; height: auto; border-bottom: 2px solid #444; display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0;">
                <table class="table table-striped" style="width:100%;">
                    <tbody>
                        <tr>
                            <td align="left" style="text-align:left;">
                                <h3 style="color: #444; font-weight: 800; margin: 5px 0; font-size: 18px;">
                                    Patient
                                </h3>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Name:</strong> ${details.patient.name}
                                </h4>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Age:</strong> ${details.patient.age} years
                                </h4>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Gender:</strong> ${details.patient.gender}
                                </h4>
                            </td>
                            <td></td>
                            <td align="right" style="text-align:right;">
                                <h3 style="color: #444; font-weight: 800; margin: 5px 0; font-size: 18px;">
                                    Doctor
                                </h3>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Name:</strong> ${details.doctor.name}
                                </h4>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Speciality:</strong> ${details.doctor.speciality}
                                </h4>
                                <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                                    <strong>Reg. No:</strong> ${details.doctor.reg_no || 'N/A'}
                                </h4>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <section style="width: 100%; height: auto; border-bottom: 2px solid #444; padding: 10px 0;">
                <div style="width: 100%; margin-bottom: 10px;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Chief Complaints: </span> ${details.chiefComplaints}
                    </h4>
                </div>
                <div style="width: 100%; margin-bottom: 10px;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Diagnosis: </span> ${details.diagnosis}
                    </h4>
                </div>
                <div style="width: 100%; margin-bottom: 10px;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Relevant Points From History: </span> ${details.previousHistory}
                    </h4>
                </div>
                <div style="width: 100%; margin-bottom: 10px;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Lab Findings:</span> ${details.labFindings}
                    </h4>
                </div>
                <div style="width: 100%;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Suggested Investigations:</span> ${details.suggestedInvestigations}
                    </h4>
                </div>
                <div style="width: 100%; margin-bottom: 10px;">
                    <h4 style="color: #444; font-size: 16px; font-weight: 400; margin: 5px 0;">
                        <span style="font-weight: 700;">Special Instructions: </span> ${details.specialInstructions}
                    </h4>
                </div>
            </section>
            <section style="width: 100%; height: auto; padding: 10px 0;">
                <h3 style="color: #444; font-weight: 800; margin-top: 10px;margin-bottom: 10px; font-size: 18px;">
                    Medicine Details
                </h3>
                <table class="table table-striped" border='0' style="width:100%;">
                    <tbody>
                        <tr style="text-align: left; color: #444; font-weight: 600;">
                            <th>S.No</th>
                            <th>Medicine Name</th>
                            <th>Frequency</th>
                            <th>Duration</th>
                            <th>Strength</th>
                            <th>Drug Form</th>
                            <th>Instruction</th>
                        </tr>
                        ${medicines.map((medicine, index) => `
                            <tr style="text-align: left; color: #444; font-weight: 400;">
                                <td style="text-align: left; color: #444; font-weight: 400;">${index + 1}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.medicineName}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.frequency}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.duration}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.strength}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.drugForm}</td>
                                <td style="text-align: left; color: #444; font-weight: 400;">${medicine.instructions}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 30px;">
                    <div style="width: 100px; height: auto; background-color: #efefef; display: flex; justify-content: center; align-items: center;">
                        <img src="${details.signature}" alt="signature" style="max-width: 100%; height: auto;">
                    </div>
                    <h4 style="text-align: left; color: #444; font-weight: 400; margin: 15px 0;">(${details.doctor.name})</h4>
                </div>
            </section>
        </section>
    </body>
    </html>
    `;
    
    module.exports = htmlContent;
    
    
    try {
        // Generate the PDF
        let pdfLink = '';
        // Create a Promise wrapper for generatePdf to use with async/await
        const generatedFileName = await generatePdf(htmlContent, headerContent, footerContent, details.prescriptionUniqueId, (err, fileName) => {
            if (err) {
                console.log(err);
                throw new Error('Failed to generate prescription');
            } else {
                return fileName;
            }
        });
        // Wait for the PDF to be generated
        pdfLink = `https://patientportalapi.akosmd.in/assets/prescriptions/${generatedFileName}`;
        // pdfLink = `file:///var/www/html/akosmd_patient/assets/prescriptions/${generatedFileName}`;
        // const shortURL = await shortenUrl(pdfLink);
        console.log('PDF generated successfully:', pdfLink);
        // console.log('shortURL generated successfully:', shortURL);
        await PatientService.savePrescription(pdfLink, details);
        // if(shortURL){
            // Send email
        //     await emailHelper(null, details.patient.email, 'Prescription Received', `<p>Hi ${details.patient.name}, Your prescription from AkosMD is available for download <a href="${shortURL}">click here</a></p>`);                    
        //     // Send SMS
        //     // const smsMessage = `Your prescription is ready. Download it from: ${pdfLink}`;
        //     const smsMessage = `Hi ${details.patient.name}, Your prescription from AkosMD is available for download here ${shortURL}.`
        //     await sendSms(details.patient.phone, smsMessage);
        // }
        // await emailHelperSMTP(null, details.patient.email, 'Prescription Received', `<p>Hi ${details.patient.name}, Your prescription from AkosMD is available for download <a href="${pdfLink}">click here</a></p>`);     
        await emailHelperSMTP(null, details.patient.email, 'Prescription Received', `<p>Hi ${details.patient.name}, <br/></br>Your prescription is now available for download. <a href="${pdfLink}">Click here</a> to access your prescription. If you have any questions or need further assistance, please contact our support team at +91-8595461929.<br/><br/>Thank you!<br/>Team AkosMD</p>`);                

        return true;
    } catch (error) {
        console.error('Error generating prescription:', error);
        throw new Error("Failed to generate prescription or send notifications.");
    }   

}

module.exports = { generatePrescription };
