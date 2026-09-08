const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const moment = require('moment');
const Notifications = require('../models/notificationsModel');

class NotificationService {

    static async createNotification(data) {
        const { title, description, referenceId, role, isActive = true } = data;

        const query = `
            INSERT INTO notifications (title, description, referenceId, role, isActive, createdAt)
            VALUES (:title, :description, :referenceId, :role, :isActive, NOW());
        `;

        await sequelizeDB1.query(query, {
            type: QueryTypes.INSERT,
            replacements: { title, description, referenceId, role, isActive }
        });

        return { message: "Notification created successfully." };
    }

    // static async getNotifications(role, referenceId, filter) {
    //     let whereClause = `WHERE 1=1`;

    //     if (role) {
    //         whereClause += ` AND role = :role`;
    //     }

    //     if (referenceId) {
    //         whereClause += ` AND referenceId = :referenceId`;
    //     }

    //     switch (filter) {
    //         case 'today':
    //             whereClause += ` AND DATE(createdAt) = CURDATE()`;
    //             break;
    //         case 'this_week':
    //             whereClause += ` AND WEEK(createdAt) = WEEK(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
    //             break;
    //         case 'this_month':
    //             whereClause += ` AND MONTH(createdAt) = MONTH(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
    //             break;
    //     }

    //     const query = `
    //         SELECT * FROM notifications
    //         ${whereClause}
    //         ORDER BY createdAt DESC;
    //     `;

    //     const notifications = await sequelizeDB1.query(query, {
    //         type: QueryTypes.SELECT,
    //         replacements: { role, referenceId }
    //     });

    //     return notifications;
    // }

    static async getNotifications(role, referenceId, filter) {
        let whereClause = `WHERE 1=1`;
        let unreadWhereClause = `WHERE 1=1`; // For counting unread notifications
    
        // Add conditions for the notifications query
        if (role) {
            whereClause += ` AND role = :role`;
            unreadWhereClause += ` AND role = :role`;
        }
    
        if (referenceId) {
            whereClause += ` AND referenceId = :referenceId`;
            unreadWhereClause += ` AND referenceId = :referenceId`;
        }
    
        switch (filter) {
            case 'today':
                whereClause += ` AND DATE(createdAt) = CURDATE()`;
                unreadWhereClause += ` AND DATE(createdAt) = CURDATE()`;
                break;
            case 'this_week':
                whereClause += ` AND WEEK(createdAt) = WEEK(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
                unreadWhereClause += ` AND WEEK(createdAt) = WEEK(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
                break;
            case 'this_month':
                whereClause += ` AND MONTH(createdAt) = MONTH(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
                unreadWhereClause += ` AND MONTH(createdAt) = MONTH(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())`;
                break;
        }
    
        const notificationsQuery = `
            SELECT * FROM notifications
            ${whereClause}
            ORDER BY createdAt DESC
            LIMIT 30;
        `;
    
        const unreadCountQuery = `
            SELECT COUNT(*) AS totalCount FROM notifications
            ${unreadWhereClause} AND isRead = 0;
        `;
    
        // Run both queries in parallel
        const [notifications, unreadCountResult] = await Promise.all([
            sequelizeDB1.query(notificationsQuery, {
                type: QueryTypes.SELECT,
                replacements: { role, referenceId }
            }),
            sequelizeDB1.query(unreadCountQuery, {
                type: QueryTypes.SELECT,
                replacements: { role, referenceId }
            })
        ]);
    
        // Extract the count from the result
        const totalCount = unreadCountResult[0]?.totalCount || 0;
    
        return { notifications, totalCount };
    }

    static async removeNotification(notificationId) {
        try {
            const notification = await Notifications.update(
                { isActive: 0 },
                { where: { id: notificationId } }
            );
        
            return notification;
        } catch (error) {
            throw new Error('Error deleting notification');
        }
    }

    static async updateReadNotification(referenceId, role) {
        try {
            const notification = await Notifications.update(
                { isRead: 1 },
                { where: { referenceId, role } }
            );
        
            return notification;
        } catch (error) {
            throw new Error('Error updating notification');
        }
    }


}

module.exports = NotificationService;
