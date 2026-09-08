const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');

class patientFolderService {
    static async getFolders(patientId, page, search) {
        const limit = 10;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                id, 
                folderName, 
                folderType 
            FROM 
                patientFolders 
            WHERE 
                isActive = 1 
                AND patientId = :patientId
        `;

        if (search) {
            query += ` AND folderName LIKE :search `;
        }

        query += ` LIMIT :limit OFFSET :offset `;

        let countQuery = `
            SELECT 
                COUNT(*) as totalCount
            FROM 
                patientFolders 
            WHERE 
                isActive = 1 
                AND patientId = :patientId
        `;

        if (search) {
            countQuery += ` AND folderName LIKE :search `;
        }

        const replacements = { patientId, limit, offset };
        const countReplacements = { patientId };

        if (search) {
            replacements.search = `%${search}%`;
            countReplacements.search = `%${search}%`;
        }

        const foldersPromise = sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        const countPromise = sequelizeDB1.query(countQuery, {
            replacements: countReplacements,
            type: QueryTypes.SELECT,
        });

        const [folders, totalCountResult] = await Promise.all([foldersPromise, countPromise]);
        const totalCount = totalCountResult[0].totalCount;

        return { folders, totalCount };
    }

    static async getFiles(patientId, folderId, timeFilter, search) {
        let query = `
            SELECT 
                id, 
                fileName, 
                fileType, 
                fileUrl, 
                DATE_FORMAT(createdAt, '%d/%m/%Y') as createdAt 
            FROM 
                patientFiles 
            WHERE 
                folderId = :folderId 
                AND isActive = 1
                AND patientId = :patientId
        `;
    
        switch (timeFilter) {
            case '1': // Last month
                query += ` AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                break;
            case '2': // Last 6 months
                query += ` AND createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                break;
            case '3': // Last 1 year
                query += ` AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                break;
            // case '0': // 'All' filter (no additional condition needed)
            //     break;
            default:
                // For 'all' or any unexpected input, no additional condition needed
                break;
        }
    
        if (search) {
            query += ` AND fileName LIKE :search `;
        }
    
        const replacements = { folderId, patientId };
        if (search) {
            replacements.search = `%${search}%`;
        }
    
        const files = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
    
        return files;
    }
}

module.exports = patientFolderService;
