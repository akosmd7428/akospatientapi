const { Medication, HealthProblem, Symptom, Vaccination, Allergy, FamilyRelation, State, City, DrugForms, Frequency } = require('../models/dataModel');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PATIENT_BACKEND_URL } = require('../config/secret');

// folders under assets/ the frontends upload into (chat attachments, lab reports, profile pictures, prescriptions)
const UPLOAD_TYPES = ['chat', 'report', 'patient', 'careNavigator', 'hr', 'prescription', 'ohc'];

// allowed mime types and the extension the file is stored with, matches the accept= lists of the frontends
const UPLOAD_MIME_TYPES = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

// same limit the frontends enforce
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
const FILE_SIGNATURES = {
    jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    gif: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
    webp: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
    pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]),
};

const uploadError = (message) => {
    const error = new Error(message);
    error.isValidation = true;
    return error;
};

class DataService {
    static async getAll(type) {
        switch(type) {
            case 'medications':
                return await Medication.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'categoryName', 'medicationName']
                });
            case 'healthProblems':
                return await HealthProblem.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'problemName']
                });
            case 'symptoms':
                return await Symptom.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'categoryName', 'symptomsName']
                });
            case 'vaccinations':
                return await Vaccination.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'categoryName', 'vaccinationName']
                });
            case 'allergies':
                return await Allergy.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'categoryName', 'allergiesName']
                });
            case 'familyRelation':
                return await FamilyRelation.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'relationName']
                });
            case 'drugForms':
                return await DrugForms.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'drugFormName']
                });
            case 'frequency':
                return await Frequency.findAll({
                    where: { isActive: true },
                    attributes: ['id', 'frequencyName']
                });
            default:
                throw new Error('Invalid type');
        }
    }

    static async getStates() {
        return await State.findAll({
            attributes: [
                'id',
                ['name', 'state']
            ]
        });
    }

    static async getCitiesByStateCode(state_id) {
        return await City.findAll({
            where: { state_id },
            attributes: ['id', 'city', 'state_id']
        });
    }
    
    static async uploadFile(fileData, type) {
        // Validate input
        if (!fileData || typeof fileData !== 'string') {
            throw uploadError('File is required.');
        }

        // only the folders the frontends upload into, never a client supplied path
        if (typeof type !== 'string' || !UPLOAD_TYPES.includes(type)) {
            throw uploadError('Invalid file type.');
        }

        // Extract the Base64 content and decode it
        const matches = fileData.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;[^,;]*)*;base64,([A-Za-z0-9+/=\s]+)$/);
        if (!matches) {
            throw uploadError('Invalid Base64 format.');
        }

        const mimeType = matches[1].toLowerCase();
        const fileExtension = UPLOAD_MIME_TYPES[mimeType];
        if (!fileExtension) {
            throw uploadError('File type not allowed.');
        }

        const buffer = Buffer.from(matches[2], 'base64');
        if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
            throw uploadError('File size must be less than 10 MB.');
        }
        // images and pdfs are served inline, their content has to match the declared type
        const signature = FILE_SIGNATURES[fileExtension];
        if (signature && !signature(buffer)) {
            throw uploadError('File content does not match its type.');
        }

        // Generate a unique filename
        const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
        // Define the path
        const currentYear = new Date().getFullYear();
        const uploadPath = path.join(__dirname, '..', 'assets', type, currentYear.toString());

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        // Define the full file path
        const filePath = path.join(uploadPath, fileName);

        // Write the file to the filesystem
        fs.writeFileSync(filePath, buffer);

        // Return the URL of the uploaded file
        const fileUrl = PATIENT_BACKEND_URL+`/assets/${type}/${currentYear}/${fileName}`;
        
        const data = {
            "fileName" : fileName,
            "fileExtension" : fileExtension,
            "fileUrl" : fileUrl
        };

        return data;
    }

}

module.exports = DataService;
