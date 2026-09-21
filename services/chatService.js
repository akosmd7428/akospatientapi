const ChatStatus = require('../models/chatStatus');
const Chat = require('../models/chat');
const { QueryTypes } = require('sequelize');
const PatientDetails = require('../models/patientDetailModel');
const CareNavigator = require('../models/careNavigatorModel');
const Doctor = require('../models/doctorModel');
const Patient = require('../models/patientModel');
const { Op , literal} = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const moment = require('moment');

class ChatService {
    // Initiate a chat session
    static async initiateChat(senderId, receiverId, message) {
        try {
            return await Chat.create({ senderId, receiverId, message, isRead: 0 });
        } catch (error) {
            console.error('Error initiating chat:', error);
            throw error;
        }
    }


    /**
     * SEC-006: careCompanyIds arrived as a raw `companyId` HTTP header and was
     * interpolated into an IN (...) clause, giving unauthenticated SQL injection
     * on GET /api/chat/searchList.
     *
     * SEC-009: it is now an array of integers derived from the caller's token.
     */
    static async chat(type, search, careCompanyIds) {
        const companyIds = (Array.isArray(careCompanyIds) ? careCompanyIds : [careCompanyIds])
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0);

        let list = [];
        if(type == 1){
            if (companyIds.length === 0) return [];
            let query = `
                SELECT 
                p.id AS chatPartnerId,
                1 AS chatPartnerType,
                CONCAT(p.first_name, ' ', p.last_name) AS chatPartnerName,
                pd.profile_image AS profilePic
            FROM 
                patient p
            LEFT JOIN 
                patientDetails pd ON p.id = pd.patientId
            WHERE 
                (p.first_name LIKE :search OR p.last_name LIKE :search)
                AND p.employer_id IN (:companyIds)
            `;

            // Sequelize expands a bound array into a correctly escaped list.
            const replacements = { companyIds, search: `%${search || ''}%` };

            list = await sequelizeDB1.query(query, {
                type: QueryTypes.SELECT,
                replacements,
            });
        }
        
        if (type == 2) { // Fetch doctors
            list = await Doctor.findAll({
                where: {
                    name: {
                        [Op.like]: `%${search || ''}%`
                    }
                },
                attributes: [
                    ['id', 'chatPartnerId'], 
                    ['name', 'chatPartnerName'], 
                    'profilePic'
                ],
                raw: true
            });
        }
    
        if (type == 3) { // Fetch careNavigator
            list = await CareNavigator.findAll({
                where: {
                    name: {
                        [Op.like]: `%${search || ''}%`
                    }
                },
                attributes: [
                    ['id', 'chatPartnerId'], 
                    ['name', 'chatPartnerName'], 
                    'profilePic'
                ],
                raw: true
            });
        }
    
        return list;
    }

    // Send a message from one user to another
    static async sendMessage(senderId, senderType, receiverId, receiverType, message, messageType, roomId) {
        try {
            return await Chat.create({ senderId, senderType, receiverId, receiverType, message, messageType, roomId, isRead: false });
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    static async getChatHistory(senderId, senderType, receiverId, receiverType) {
        try {
            const todayStart = moment().startOf('day').toDate();
            const sevenDaysAgo = moment().subtract(7, 'days').toDate();
            
            // Check if senderType or receiverType is 1 or 2
            const isSpecificType = (senderType === 1 && receiverType === 2) || (receiverType === 1 && senderType === 2);
            
            // Define the date condition dynamically
            const dateCondition = isSpecificType
                ? { createdAt: { [Op.gte]: todayStart } } // Fetch only today's chats
                : { createdAt: { [Op.gte]: sevenDaysAgo } }; // Fetch chats from the last 7 days
            
            // Query with the dynamic date condition
            const chatHistory = await Chat.findAll({
                where: {
                    [Op.or]: [
                        { senderId, senderType, receiverId, receiverType },
                        { senderId: receiverId, receiverId: senderId }
                    ],
                    ...dateCondition
                },
                order: [['createdAt', 'DESC']],
                raw: true
            });
            return await this.formatChatHistory(chatHistory, senderId, senderType);
        } catch (error) {
            console.error('Error fetching chat history:', error);
            throw error;
        }
    }

    static async formatChatHistory(chatHistory, senderId, senderType) {
        const groupedMessages = {};
        const formattedMessages = [];
    
        for (const chat of chatHistory) {
            const messageDate = moment(chat.createdAt).startOf('day');
            const today = moment().startOf('day');
            const yesterday = moment().subtract(1, 'days').startOf('day');
    
            const dateLabel = messageDate.isSame(today) ? 'Today' :
                messageDate.isSame(yesterday) ? 'Yesterday' : messageDate.format('YYYY-MM-DD');
    
            if (!groupedMessages[dateLabel]) {
                groupedMessages[dateLabel] = [];
            }
            
            let messageType;
            if (chat.senderId == senderId && chat.senderType == senderType) {
                messageType = "send";
            } else if (chat.receiverId == senderId && chat.receiverType == senderType) {
                messageType = "received";
            }
    
            const userDetails = await this.getUserDetails(chat.senderId, chat.senderType);
            if (chat.senderType && chat.receiverType && chat.message && chat.messageType) {
                let createdAt = new Date(chat.createdAt + "Z"); // Treat it as UTC
                // Step 1: Parse the UTC timestamp into a Date object
                let utcDate = createdAt;

                // Step 2: Convert to Asia/Kolkata timezone
                let asiaKolkataDate = new Date(utcDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

                // Step 3: Format the date into AM/PM format
                let formattedTime = asiaKolkataDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                });
                if(messageType != undefined){
                    groupedMessages[dateLabel].push({
                        id: chat.id,
                        message: chat.message,
                        messageType: chat.messageType,
                        time: formattedTime,
                        type: messageType,
                        userId: userDetails.id,
                        profilePic: userDetails.profilePic
                    });
                }
            }
        }
    
        for (const date in groupedMessages) {
            if (groupedMessages[date].length > 0) {
                // Sort by id instead of time
                groupedMessages[date].sort((a, b) => a.id - b.id);
                formattedMessages.push({
                    date,
                    messages: groupedMessages[date]
                });
            }
        }
    
        return formattedMessages.reverse();
    }    

    static async getUserDetails(userId, userType) {
        try {
            let userModel;
            let profilePicAttr;

            switch (userType) {
                case 1:
                    userModel = PatientDetails;
                    profilePicAttr = 'profile_image';
                    break;
                case 2:
                    userModel = Doctor;
                    profilePicAttr = 'profilePic';
                    break;
                case 3:
                    userModel = CareNavigator;
                    profilePicAttr = 'profilePic';
                    break;
                default:
                    return { id: userId, userType, profilePic: null };
            }

            const userDetails = await userModel.findOne({
                where: { id: userId },
                attributes: [profilePicAttr, 'id']
            });

            return {
                id: userDetails?.id || userId,
                userType,
                profilePic: userDetails?.[profilePicAttr] || null
            };
        } catch (error) {
            console.error('Error fetching user details:', error);
            throw error;
        }
    }

    // Get the online status of a user
    static async getUserStatus(userId, userType) {
        try {
            return await ChatStatus.findOne({ where: { userId, userType } });
        } catch (error) {
            console.error('Error fetching user status:', error);
            throw error;
        }
    }

    // Update the online status of a user
    static async updateUserStatus(userId, userType, isOnline) {
        try {
            const userStatus = await ChatStatus.findOne({ where: { userId, userType } });

            if (userStatus) {
                userStatus.isOnline = isOnline;
                userStatus.lastActive = new Date();
                return await userStatus.save();
            } else {
                return await ChatStatus.create({ userId, userType, isOnline, lastActive: new Date() });
            }
        } catch (error) {
            console.error('Error updating user status:', error);
            throw error;
        }
    }

    static async getChatList(userId, userType, searchKey = '') {
        try {
            /**
             * SEC-006: userId and userType were interpolated directly into
             * sequelizeDB1.literal(), which emits raw SQL with no escaping. Both
             * values came from req.query on an unauthenticated route and from an
             * unauthenticated Socket.IO event, giving injection in the SELECT list.
             *
             * literal() has no parameter binding, so the values are coerced to
             * integers first and the query is refused if they are not. Number
             * validation is a sufficient guard here because an integer cannot
             * carry SQL.
             */
            const uid = Number(userId);
            const utype = Number(userType);
            if (!Number.isInteger(uid) || !Number.isInteger(utype)) {
                throw new Error('Invalid chat identifiers');
            }

            // Fetch chat list with aggregation for unread messages
            const chatList = await Chat.findAll({
                where: {
                    [Op.or]: [
                        { senderId: uid, senderType: utype },
                        { receiverId: uid, receiverType: utype }
                    ]
                },
                attributes: [
                    [sequelizeDB1.literal(`IF(senderId = ${uid} AND senderType = ${utype}, receiverId, senderId)`), 'chatPartnerId'],
                    [sequelizeDB1.literal(`IF(senderId = ${uid} AND senderType = ${utype}, receiverType, senderType)`), 'chatPartnerType'],
                    [sequelizeDB1.literal(`SUM(IF(isRead = 0 AND receiverId = ${uid} AND receiverType = ${utype}, 1, 0))`), 'unreadMessages'],
                ],
                group: ['chatPartnerId', 'chatPartnerType'],
                raw: true
            });
    
            // Process chat list to include additional details and filter by search key
            const filteredChatList = await Promise.all(chatList.map(async chat => {
                const { chatPartnerId, chatPartnerType } = chat;
                // if(userType == 1 && chatPartnerType == 2){ } else if(userType == 2 && chatPartnerType == 1){} else{
                    // Fetch the chat partner's details and online status
                    const receiverDetails = await this.getUserDetailsList(chatPartnerId, chatPartnerType);
                    const chatStatus = await ChatStatus.findOne({
                        where: {
                            userId: chatPartnerId,
                            userType: chatPartnerType
                        },
                        attributes: ['isOnline'],
                        raw: true
                    });

                    const todayStart = moment().startOf('day').toDate();
                    const sevenDaysAgo = moment().subtract(7, 'days').toDate();                 
                    const dateCondition = { createdAt: { [Op.gte]: sevenDaysAgo } }; // Fetch chats from the last 7 days

        
                    const lastMessage = await Chat.findOne({
                        where: {
                            [Op.or]: [
                                { senderId: chatPartnerId, senderType: chatPartnerType, receiverId: userId, receiverType: userType },
                                { senderId: userId, senderType: userType, receiverId: chatPartnerId, receiverType: chatPartnerType }
                            ],
                             ...dateCondition                            
                        },
                        order: [['id', 'DESC']], // Order by latest message ID
                        raw: true
                    });
        
                    const chatPartnerName = receiverDetails.name || '';
                    
                    // Filter by search key
                    if (searchKey && !chatPartnerName.toLowerCase().includes(searchKey.toLowerCase())) {
                        return null; // Skip if the name does not match the search key
                    }
        
                    return {
                        ...chat,
                        profilePic: receiverDetails.profilePic,
                        chatPartnerName,
                        lastMessage: lastMessage?.message || null,
                        lastMessageType: lastMessage?.messageType || null,
                        lastMessageTime: lastMessage?.createdAt || null,
                        lastMessageId: lastMessage?.id || null,
                        isOnline: chatStatus?.isOnline || false // Add the isOnline status
                    };
                // }
            }));
    
            // Remove null entries that didn't match the search criteria
            const validChatListtemp = filteredChatList.filter(chat => chat !== null);
            const validChatList = validChatListtemp.filter(chat => chat !== undefined);
            // Sort the chat list by last message time and last message ID in descending order
            validChatList.sort((a, b) => {
                if (a.lastMessageTime === b.lastMessageTime) {
                    // If times are equal, sort by lastMessageId in descending order
                    return b.lastMessageId - a.lastMessageId;
                }
                // Otherwise, sort by lastMessageTime in descending order
                return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
            });
    
            return validChatList;
        } catch (error) {
            console.error('Error fetching chat list:', error);
            throw error;
        }
    }    

    static async getUserDetailsList(userId, userType) {
        try {
            let userModel, profilePicAttr, nameAttrs, name;
    
            switch (userType) {
                case 1: // Assuming 1 represents a Patient
                    const patientDetails = await PatientDetails.findOne({
                        where: { id: userId },
                        attributes: ['profile_image']
                    });
    
                    const patientName = await Patient.findOne({
                        where: { id: userId },
                        attributes: ['first_name', 'last_name']
                    });
    
                    profilePicAttr = patientDetails?.profile_image || null;
                    name = `${patientName?.first_name || ''} ${patientName?.last_name || ''}`.trim();
                    break;
    
                case 2: // Assuming 2 represents a Doctor
                    userModel = Doctor;
                    profilePicAttr = 'profilePic';
                    nameAttrs = ['name'];
                    break;
    
                case 3: // Assuming 3 represents a Care Navigator
                    userModel = CareNavigator;
                    profilePicAttr = 'profilePic';
                    nameAttrs = ['name'];
                    break;
    
                default:
                    return { profilePic: null, name: null, userType: null };
            }
    
            if (userType === 1) {
                return {
                    profilePic: profilePicAttr,
                    name,
                    userType
                };
            } else {
                const userDetails = await userModel.findOne({
                    where: { id: userId },
                    attributes: [profilePicAttr, ...nameAttrs]
                });
    
                // Construct the name based on available attributes
                name = nameAttrs.length > 1
                    ? `${userDetails?.[nameAttrs[0]] || ''} ${userDetails?.[nameAttrs[1]] || ''}`.trim()
                    : userDetails?.[nameAttrs[0]] || null;
    
                return {
                    profilePic: userDetails?.[profilePicAttr] || null,
                    name,
                    userType
                };
            }
        } catch (error) {
            console.error('Error fetching user details list:', error);
            throw error;
        }
    }    

    // Update the read status of messages
    static async updateReadStatus(senderId, senderType, receiverId, receiverType) {
        try {
            const [affectedRow] = await Chat.update({ isRead: 1 }, {
                where: {
                    senderId: senderId,
                    senderType: senderType,
                    receiverId: receiverId,
                    receiverType: receiverType
                }
            });

            await Chat.update({ isRead: 1 }, {
                where: {
                    senderId: receiverId,
                    senderType: receiverType,
                    receiverId: senderId,
                    receiverType: senderType
                }
            });
    
            return affectedRow;
        } catch (error) {
            console.error('Error updating read status:', error);
            throw error;
        }
    }    

    static async getCallDetailsForPatient(userId) {
        try {
            const query = `
                SELECT 
                    patient_id AS patientId, 
                    pcp_doctor_id AS doctorId, 
                    group_id AS groupId
                FROM 
                    connect_waiting_room
                WHERE 
                    patient_id = :userId 
                    AND status = 'Inprogress';
            `;
        
            const [results] = await sequelizeDB1.query(query, {
                replacements: { userId },
                type: sequelizeDB1.QueryTypes.SELECT
            });
        
            return results; // Returns an array of results (even if only one row)
        } catch (error) {
            console.error('Error fetching call details:', error);
            throw error;
        }
    }

    static async getCallDetailsForPatientAccept(userId) {
        try {
            const query = `
            SELECT 
                    patient_id AS patientId, 
                    pcp_doctor_id AS connected_doctorId,
                    doctor.name,
                    doctor.gender, 
                    doctor.id as doctor_id,
                    doctor.profilePic,
                    doctor.experience,                    
                    group_id AS groupId
                FROM 
                    connect_waiting_room
                LEFT JOIN
                    connect_provider 
                    on connect_waiting_room.pcp_doctor_id = connect_provider.id
                LEFT JOIN
                    doctor 
                    on connect_provider.doctor_id = doctor.id
                WHERE 
                    patient_id = :userId
                    AND connect_waiting_room.status = 'In progress';                
            `;           
            const [results] = await sequelizeDB1.query(query, {
                replacements: { userId: userId },
                type: sequelizeDB1.QueryTypes.SELECT
            });
        
            return results; // Returns an array of results (even if only one row)
        } catch (error) {
            console.error('Error fetching call details:', error);
            throw error;
        }
    }

    static async updateCallingRoom(doctorId,patientId,connectDocId) {
        try {
            const query = `
            UPDATE 
                connect_waiting_room
            Set 
                status = 'COMPLETED'
            WHERE 
                patient_id = :patientId
            AND
                pcp_doctor_id=:connectDocId

           ;                
            `;           
            const [results] = await sequelizeDB1.query(query, {
                replacements: { patientId: patientId,connectDocId:connectDocId },
                type: sequelizeDB1.QueryTypes.UPDATE
            });
        
            return results; // Returns an array of results (even if only one row)
        } catch (error) {
            console.error('Error fetching call details:', error);
            throw error;
        }
    }

    // update chat room for the particular patient
    static async updateBeforeCallinPatent(patientId) {
        try {
            const query = `
            UPDATE 
                connect_waiting_room
            Set 
                status = 'COMPLETED'
            WHERE 
                patient_id = :patientId           
           ;                
            `;           
            const [results] = await sequelizeDB1.query(query, {
                replacements: { patientId: patientId},
                type: sequelizeDB1.QueryTypes.UPDATE
            });
        
            return results; // Returns an array of results (even if only one row)
        } catch (error) {
            console.error('Error fetching call details:', error);
            throw error;
        }
    }

}

module.exports = ChatService;
