const { Medication, HealthProblem, Symptom, Vaccination, Allergy, FamilyRelation, State, City, DrugForms, Frequency } = require('../models/dataModel');
const fs = require('fs');
const fsp = require('fs').promises; // SEC-014: async writes, no event-loop blocking
const path = require('path');
const crypto = require('crypto');
const { PATIENT_BACKEND_URL } = require('../config/secret');

class DataService {
    /**
     * SEC-014: magic-byte check. The declared MIME type is attacker-controlled,
     * so an HTML payload could be declared as image/png and stored with a .png
     * extension. This verifies the bytes actually match.
     */
    static matchesDeclaredType(buffer, declaredMime) {
        if (buffer.length < 12) return false;
        const hex = buffer.subarray(0, 12).toString('hex').toLowerCase();

        switch (declaredMime) {
            case 'image/jpeg':
            case 'image/jpg':
                return hex.startsWith('ffd8ff');
            case 'image/png':
                return hex.startsWith('89504e470d0a1a0a');
            case 'image/webp':
                return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
            case 'application/pdf':
                return hex.startsWith('25504446'); // %PDF
            default:
                return false;
        }
    }

    static async getAll(type) {
        console.log('tt',type);
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
    
    /**
     * SEC-014: this derived the stored file's EXTENSION from a client-supplied MIME
     * type and a DIRECTORY SEGMENT from a client-supplied `type`, with no
     * allow-list on either.
     *
     * Two consequences: `text/html` produced a .html file that express.static
     * served as HTML on the API's own origin (stored XSS), and `type: "../../.."`
     * escaped assets/ entirely because path.join resolves `..` and
     * mkdirSync({recursive:true}) creates whatever it is given.
     *
     * There was also no size limit and no check that the content matched the
     * declared type.
     */
    static async uploadFile(fileData, type) {
        if (!fileData) {
            throw new Error('File is required.');
        }

        // The extension comes from OUR table, never from the client's string.
        const ALLOWED_TYPES = new Map([
            ['image/jpeg', 'jpg'],
            ['image/jpg', 'jpg'],
            ['image/png', 'png'],
            ['image/webp', 'webp'],
            ['application/pdf', 'pdf'],
        ]);
        const ALLOWED_CATEGORIES = new Set([
            'patient', 'chat', 'prescription', 'prescriptions', 'report', 'signature', 'careNavigator',
        ]);
        const MAX_BYTES = 10 * 1024 * 1024;

        const matches = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(fileData);
        if (!matches) {
            throw new Error('Invalid Base64 format.');
        }

        const declaredMime = matches[1].toLowerCase();
        const base64Data = matches[2];

        const fileExtension = ALLOWED_TYPES.get(declaredMime);
        if (!fileExtension) {
            throw new Error('Unsupported file type.');
        }

        // Exact match against the allow-list, not sanitisation of an arbitrary string.
        if (!ALLOWED_CATEGORIES.has(type)) {
            throw new Error('Invalid upload category.');
        }

        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) {
            throw new Error('File is empty.');
        }
        if (buffer.length > MAX_BYTES) {
            throw new Error('File too large.');
        }

        // Verify the real content type from magic bytes: the declared type is a
        // hint from the client, not a fact.
        if (!DataService.matchesDeclaredType(buffer, declaredMime)) {
            throw new Error('File content does not match its declared type.');
        }

        const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
        const currentYear = new Date().getFullYear();

        const uploadRoot = path.resolve(__dirname, '..', 'assets');
        const uploadPath = path.resolve(uploadRoot, type, String(currentYear));

        // Containment assertion - defence in depth behind the allow-list above.
        if (uploadPath !== uploadRoot && !uploadPath.startsWith(uploadRoot + path.sep)) {
            throw new Error('Invalid upload path.');
        }

        await fsp.mkdir(uploadPath, { recursive: true });

        const filePath = path.join(uploadPath, fileName);

        // Async: writeFileSync blocked the event loop for every upload.
        await fsp.writeFile(filePath, buffer);

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
