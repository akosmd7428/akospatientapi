const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const LabTestPrescription = require('../models/labTestPrescriptions');
const LabCity = require('../models/labCity');
const LabOrder = require('../models/labOrder');
const LabOrderDetails = require('../models/labOrderDetails');
const Cart = require('../models/cart');
const CartDetails = require('../models/cartDetail');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logError } = require('../helpers/logErrorHelper');
const { PATIENT_BACKEND_URL, DEV_PAYUMONEY_LINK, DEV_PAYU_MONEY_SALT, DEV_PAYU_MONEY_KEY, DEV_PAYU_SUCCESS_URL, DEV_PAYU_FAILED_URL, DEV_PAYU_CANCEL_URL,REDCLIFF_BASE_URL,REDCLIFF_COOKIE,REDCLIFF_KEY } = require('../config/secret');
const axios = require('axios');
const Razorpay = require('razorpay');
const Patient = require('../models/patientModel');
const NotificationService = require('./notificationService');
const { sendSms } = require('./smsService');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const EmailTemplates = require('../helpers/emailTemplates');
const LabTestBookingAddress = require('../models/labTestBookingAddress');
const CareNavigator = require('../models/careNavigatorModel');

const LAB_ORDER_APPROVED_MESSAGE = 'This lab test is already approved by the care navigator. Please contact your care navigator to reschedule it.';
const LAB_RESCHEDULE_WINDOW_MESSAGE = 'Reschedule is allowed only up to 2 days before the booked date and time. Please contact your care navigator.';
// hr lab test tabs: the status the frontend sends for a tab and the order statuses that tab lists
const HR_LAB_STATUS_TABS = [
    { key: 'requested', label: 'Requested', status: 'pending', orderStatuses: ['pending', 'Payment Completed'], color: '#8AB8EA' },
    { key: 'scheduled', label: 'Scheduled', status: 'confirmed', orderStatuses: ['confirmed', 'Reschedule'], color: '#3A8DDE' },
    { key: 'collected', label: 'Collected', status: 'Completed', orderStatuses: ['Completed'], color: '#1F5FA3' },
    { key: 'reportReceived', label: 'Report received', status: 'Report Generated', orderStatuses: ['Report Generated'], color: '#22B07D' },
    { key: 'cancelled', label: 'Cancelled', status: 'cancelled', orderStatuses: ['cancelled'], color: '#E54B4B' },
];
const HR_LAB_FILTER_LABELS = { '1': 'Last 30 days', '2': 'Last 6 months', '3': 'Last 1 year', all: 'All time' };

// start of a booked slot: bookingDate "YYYY-MM-DD" (or "DD-MM-YYYY") + bookingTime "8:00 AM to 9:00 AM"
function bookingStartTime(bookingDate, bookingTime) {
    if (!bookingDate) return null;
    let m = String(bookingDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
    let year, month, day;
    if (m) { [, year, month, day] = m; }
    else if ((m = String(bookingDate).match(/^(\d{2})-(\d{2})-(\d{4})/))) { [, day, month, year] = m; }
    else return null;
    let hours = 0, minutes = 0;
    const t = String(bookingTime || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (t) {
        hours = Number(t[1]) % 12 + (t[3].toUpperCase() === 'PM' ? 12 : 0);
        minutes = Number(t[2]);
    }
    // slots are Indian times; build the instant in IST whatever the server timezone is
    const pad = (n) => String(n).padStart(2, '0');
    return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+05:30`);
}
const SubscriptionPlanAvail = require('../models/subscriptionPlanAvail');

const PAYU_MONEY_API_URL = DEV_PAYUMONEY_LINK;
const PAYU_MONEY_KEY = DEV_PAYU_MONEY_KEY; // Replace with your actual key
const PAYU_MONEY_SALT = DEV_PAYU_MONEY_SALT; // Replace with your actual salt
const REDCLIFF_LAB_URL = REDCLIFF_BASE_URL;

// the apps send 1/2, the tables store the enum names
const ITEM_TYPES = { 1: 'Test', 2: 'Package', Test: 'Test', Package: 'Package' };
const ITEM_MODES = { 1: 'Pathology', 2: 'Radiology', Pathology: 'Pathology', Radiology: 'Radiology' };
// order columns a patient may set when placing an order (payment / status columns are server side only)
const LAB_ORDER_FIELDS = ['bookingDate', 'bookingTime', 'bookingAddress', 'labId', 'labCityName', 'labBranchId', 'subCityId', 'price', 'discountApplied', 'otherCharges', 'totalPrice', 'slotId', 'availableSlotId', 'labType', 'code'];
const LAB_ORDER_DETAIL_FIELDS = ['name', 'modeOfTest', 'noOfTest', 'labId', 'labType', 'code'];
const UPLOAD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
const COUPON_MAX_ATTEMPTS = 10;
const COUPON_WINDOW_MS = 15 * 60 * 1000;
const couponAttempts = new Map();

// care navigator company ids as an int list for "IN (:careCompanyIds)", -1 matches nothing when empty
const toCompanyIdList = (ids) => {
    const list = (Array.isArray(ids) ? ids : String(ids ?? "").split(","))
        .map(id => parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0);
    return list.length ? list : [-1];
};

// error with an http status the controller can return as is
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const safeEqual = (a, b) => {
    const left = Buffer.from(String(a ?? ''));
    const right = Buffer.from(String(b ?? ''));
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};

class labTestService {
    // companies the patient belongs to: own company plus the connected companies (a dependent uses the parent's)
    static async getPatientCompanyIds(patientId) {
        const patient = await Patient.findOne({ where: { id: patientId }, attributes: ['id', 'parent_id', 'companyId', 'employer_id'] });
        if (!patient) return [];
        const ownerIds = [patient.id];
        if (Number(patient.parent_id) > 0) ownerIds.push(patient.parent_id);
        const rows = await sequelizeDB1.query(
            'SELECT companyId FROM connectedCompaniesPatient WHERE patientId IN (:ownerIds) AND isActive = 1',
            { replacements: { ownerIds }, type: QueryTypes.SELECT }
        );
        return [patient.companyId, patient.employer_id, ...rows.map(row => row.companyId)]
            .map(id => parseInt(id, 10))
            .filter((id, index, list) => Number.isInteger(id) && id > 0 && list.indexOf(id) === index);
    }

    static async isPatientCompany(patientId, companyId) {
        const companyIds = await this.getPatientCompanyIds(patientId);
        return companyIds.includes(parseInt(companyId, 10));
    }

    // true when the patient belongs to one of the care navigator's companies
    static async isPatientInCareScope(patientId, careCompanyIds) {
        if (!Array.isArray(careCompanyIds) || careCompanyIds.length === 0) return false;
        const [row] = await sequelizeDB1.query(
            'SELECT id FROM patient WHERE id = :patientId AND (companyId IN (:careCompanyIds) OR employer_id IN (:careCompanyIds)) LIMIT 1',
            { replacements: { patientId, careCompanyIds }, type: QueryTypes.SELECT }
        );
        return !!row;
    }

    static async getOwnedCart(cartId, patientId) {
        if (!cartId) return null;
        return Cart.findOne({ where: { id: cartId, patientId } });
    }

    // razorpay checkout signature: hmac_sha256(order_id|payment_id, key_secret)
    static verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, signature) {
        const secret = process.env.RAZORPAY_SECRET;
        if (!secret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
        const expected = crypto.createHmac('sha256', secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
        return safeEqual(expected, signature);
    }

    // payment response must be signed by razorpay for the razorpay order created for this lab order
    static async verifyLabOrderPayment(orderId, response) {
        const payment = response && typeof response === 'object' ? response : {};
        const [row] = await sequelizeDB1.query(
            'SELECT razorpay_order_id FROM labOrders WHERE id = :orderId LIMIT 1',
            { replacements: { orderId }, type: QueryTypes.SELECT }
        );
        if (!row || !row.razorpay_order_id || !safeEqual(row.razorpay_order_id, payment.razorpay_order_id)) return false;
        return this.verifyRazorpaySignature(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature);
    }

    // amount the patient has to pay for an order, same rule as the cart summary page (paid items: price - discount)
    static async getPayableTotal(orderId) {
        const [order] = await this.getLabOrdersByPatientId(orderId);
        if (!order) return null;
        let total = 0;
        for (const item of order.orderDetails) {
            if (item.isFree !== 1) {
                total += (parseFloat(item.price) || 0) - (parseFloat(item.discount) || 0);
            }
        }
        return Math.max(0, Math.round(total * 100) / 100);
    }

    // whitelist the order fields and check every item against the patient's cart and the lab price list
    static async prepareLabOrder(body, patientId) {
        const details = body.orderDetails;
        if (!Array.isArray(details) || details.length === 0 || details.length > 100) {
            throw httpError(400, 'Order items are required');
        }
        const cart = await this.getOwnedCart(body.cartId, patientId);
        if (!cart) {
            throw httpError(404, 'Cart not found');
        }
        const cartItems = await CartDetails.findAll({ where: { cartId: cart.id, patientId, isDeleted: false } });
        const companyIds = await this.getPatientCompanyIds(patientId);

        const orderData = { patientId };
        for (const field of LAB_ORDER_FIELDS) {
            if (body[field] !== undefined) orderData[field] = body[field];
        }

        const orderDetails = [];
        for (const detail of details) {
            const type = ITEM_TYPES[detail?.type];
            const mode = ITEM_MODES[detail?.mode];
            if (!type || !mode) {
                throw httpError(400, 'Invalid order item');
            }
            const cartItem = cartItems.find(item => Number(item.referenceId) === Number(detail.referenceId) && item.type === type && item.mode === mode);
            if (!cartItem) {
                throw httpError(400, 'Order items must be in your cart');
            }
            let patientCompanyId = null;
            if (detail.patientCompanyId !== undefined && detail.patientCompanyId !== null && detail.patientCompanyId !== '') {
                patientCompanyId = parseInt(detail.patientCompanyId, 10);
                if (!companyIds.includes(patientCompanyId)) {
                    throw httpError(403, 'Invalid company');
                }
            }
            const price = detail.price === null || detail.price === undefined || detail.price === '' ? 0 : Number(detail.price);
            const discount = detail.discount === null || detail.discount === undefined || detail.discount === '' ? 0 : Number(detail.discount);
            if (!Number.isFinite(price) || !Number.isFinite(discount) || price < 0 || discount < 0 || discount > price) {
                throw httpError(400, 'Invalid item price');
            }
            // the price / discount pair must be one the lab price list offers for this item
            const catalog = await sequelizeDB1.query(
                'SELECT price, discount FROM connectedLabs WHERE referenceId = :referenceId AND type = :type AND mode = :mode AND isActive = 1',
                { replacements: { referenceId: cartItem.referenceId, type, mode }, type: QueryTypes.SELECT }
            );
            const listed = catalog.some(row => Math.abs(Number(row.price || 0) - price) < 0.01 && Math.abs(Number(row.discount || 0) - discount) < 0.01);
            if (!listed && (price > 0 || discount > 0 || await this.isPaymentRequired(patientCompanyId))) {
                throw httpError(400, 'Item prices have changed, please refresh your cart');
            }
            const item = {};
            for (const field of LAB_ORDER_DETAIL_FIELDS) {
                if (detail[field] !== undefined) item[field] = detail[field];
            }
            orderDetails.push({
                ...item,
                type,
                mode,
                referenceId: cartItem.referenceId,
                // company of the cart item decides whether a company package is free, never the app
                companyIdPackageTest: cartItem.companyId,
                patientCompanyId,
                price,
                discount,
                total: Math.round((price - discount) * 100) / 100,
            });
        }
        return { ...orderData, orderDetails };
    }

    static async isPaymentRequired(companyId) {
        if (!companyId) return true;
        const [company] = await sequelizeDB1.query(
            'SELECT is_pament_required FROM worksman_company_list WHERE id = :companyId LIMIT 1',
            { replacements: { companyId }, type: QueryTypes.SELECT }
        );
        return !company || Number(company.is_pament_required) === 1;
    }

    static async getPackagesAndTests(companyId, search) {
        const packageQuery = `
            SELECT 
                cp.companyId, 
                cp.categoryId, 
                lp.id AS labPackageId, 
                lp.packageName, 
                MAX(cp.type) AS type,
                MAX(cp.mode) AS mode,
                lc.categoryname AS categoryName,
                MAX(lp.noOfTest) AS noOfTest,
                MAX(lp.price) AS price,
                GROUP_CONCAT(DISTINCT lt.name) AS tests,
                lp.labType,
                lp.packageCode
               
            
            FROM connectedCompaniesLabPackages cp
            JOIN labPackages lp ON cp.labPackageId = lp.id
            JOIN labsCategory lc ON cp.categoryId = lc.id
            JOIN connectedLabTestPackages cltp ON lp.id = cltp.labPackageId
            JOIN labTests lt ON cltp.labTestId = lt.id
            WHERE           
                
            cp.isActive = 1 AND lp.isActive = 1 AND cp.companyId = :companyId
            ${search ? `AND (lp.packageName LIKE :search OR lt.name LIKE :search)` : ''}
            GROUP BY 
                cp.companyId,
                cp.categoryId,
                lp.packageName,
                lp.id, lc.categoryname 
            ORDER BY
            
            lc.categoryname ASC;
        `;

        /*
         SELECT 
    cp.companyId, 
    cp.categoryId, 
    lp.id AS labPackageId, 
    lp.packageName, 
    MAX(cp.type) AS type,
    MAX(cp.mode) AS mode,
    lc.categoryname AS categoryName,
    MAX(lp.noOfTest) AS noOfTest,
    MAX(lp.price) AS price,
    GROUP_CONCAT(DISTINCT lt.name ORDER BY lt.name SEPARATOR ', ') AS tests,
    lp.labType,
    lp.packageCode
FROM connectedCompaniesLabPackages cp
JOIN labPackages lp 
    ON cp.labPackageId = lp.id
JOIN labsCategory lc 
    ON cp.categoryId = lc.id
JOIN connectedLabTestPackages cltp 
    ON lp.id = cltp.labPackageId
JOIN labTests lt 
    ON cltp.labTestId = lt.id
WHERE
    cp.isActive = 1
    AND lp.isActive = 1
    AND cp.companyId = 87
GROUP BY 
    cp.companyId, 
    cp.categoryId, 
    lp.id,             -- ✅ ensures uniqueness by package ID
    lp.packageName,
    lc.categoryname
ORDER BY 
    lc.categoryname ASC, 
    lp.packageName ASC;
        */
        // cp.companyId = :companyId AND 
        const testQuery = `
            SELECT 
                ct.companyId, 
                ct.categoryId, 
                lt.id AS labTestId, 
                lt.name AS testName,
                MAX(ct.type) AS type,
                MAX(ct.mode) AS mode,
                lc.categoryname AS categoryName,
                lt.description,
                lt.labType,
                lt.testCode,
                lt.labId
            FROM connectedCompaniesLabTests ct
            JOIN labTests lt ON ct.labTestId = lt.id
            JOIN labsCategory lc ON ct.categoryId = lc.id
            WHERE lt.isActive = 1 AND ct.isActive = 1 AND ct.companyId = :companyId 
            ${search ? `AND lt.name LIKE :search` : ''}
            GROUP BY ct.companyId, ct.categoryId, lt.id, lc.categoryname
            ORDER BY lc.categoryname ASC;
        `;
        //AND ct.isActive = 1  ct.companyId = :companyId 
        // JOIN labTests lt ON ct.labTestId = lt.id 
        const [categoryPackages, categoryTests] = await Promise.all([
            sequelizeDB1.query(packageQuery, {
                replacements: { companyId, search: `%${search}%` },
                type: sequelizeDB1.QueryTypes.SELECT
            }),
            sequelizeDB1.query(testQuery, {
                replacements: { companyId, search: `%${search}%` },
                type: sequelizeDB1.QueryTypes.SELECT
            })
        ]);

        // Structuring the data as per the required format
        const structuredPackages = categoryPackages.reduce((acc, item) => {
            if (!acc[item.categoryName]) {
                acc[item.categoryName] = [];
            }
            acc[item.categoryName].push({
                companyId: item.companyId,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                packageId: item.labPackageId,
                packageName: item.packageName,
                packageType: item.type,
                packageMode: item.mode,
                noOfTest: item.noOfTest,
                price:item.price,
                tests: item.tests ? item.tests.split(',') : [],
                labId: item.labId,
                labType: item.labType,
                packageCode: item.packageCode,
            });
            return acc;
        }, {});

        const structuredTests = categoryTests.reduce((acc, item) => {
            if (!acc[item.categoryName]) {
                acc[item.categoryName] = [];
            }
            acc[item.categoryName].push({
                companyId: item.companyId,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                testId: item.labTestId,
                testName: item.testName,
                testType: item.type,
                testMode: item.mode,
                description: item.description,
                labType: item.labType,
                testCode: item.testCode,
                labId: item.labId
            });
            return acc;
        }, {});

        return {
            categoryPackages: structuredPackages,
            categoryTests: structuredTests
        };
    }

    static async uploadPrescription({ prescriptionFile, notes, patientId }) {
        // let prescriptionFilePath = null;
        // if (prescriptionFile) {
        //     prescriptionFilePath = await this.saveImage(prescriptionFile.buffer, prescriptionFile.extension, 'prescription');
        // }
        return await LabTestPrescription.create({
            prescriptionFile: prescriptionFile,
            notes,
            patientId,
        });
    }

    static async saveImage(buffer, extension, type) {
        try {
            if (!buffer) throw new Error("No file provided");

            // Extract the image extension from MIME type
            // const extension = mimeType.split('/')[1];
            if (!extension) throw new Error("Unable to determine file extension");
            const safeExtension = String(extension).toLowerCase();
            if (!UPLOAD_EXTENSIONS.includes(safeExtension)) throw new Error("File type not allowed");
            const safeType = String(type).replace(/[^a-z0-9]/gi, '') || 'file';

            // Generate file paths, random names so files under /assets cannot be guessed
            const year = new Date().getFullYear();
            const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
            const fileName = `${safeType}_${crypto.randomBytes(16).toString('hex')}.${safeExtension}`;
            const dir = path.join(__dirname, '..', 'assets', year.toString(), month);
            const filePath = path.join(dir, fileName);
            const filePathFinal = `${PATIENT_BACKEND_URL}/assets/${year}/${month}/${fileName}`;

            // Ensure the directory exists
            await fs.mkdir(dir, { recursive: true });

            // Write the image file
            await fs.writeFile(filePath, buffer);

            return filePathFinal;

        } catch (error) {
            console.error("Error while saving file:", error);
            throw new Error("Error while saving file");
        }
    }

    static async addToCart({ patientId, type, mode, referenceId,companyId,labId,labType,code }) {
        // Checking cart exists or not
        const cartDetail = await Cart.findOne( { where: { patientId } } );
        if(cartDetail) { // Cart Exists
            const cartCount = await CartDetails.findOne({
                where: { cartId: cartDetail.id, patientId:patientId, type:type, referenceId:referenceId }
            });
            if(!cartCount){
                return await CartDetails.create({
                    cartId: cartDetail.id, 
                    patientId,
                    type,
                    mode,
                    referenceId,
                    companyId,
                    labId,
                    labType,
                    code
                });
            }else{
                throw httpError(400, "This item already added into cart");
            }
        }else{ //Cart not exists
            console.log("cart mode",mode);
            if(mode === 2){            
                const cartDetail = await Cart.create( { patientId} );
                if(cartDetail){
                    const cartCount = await CartDetails.findOne({
                        where: { cartId: cartDetail.id, patientId:patientId, type:type, referenceId:referenceId }
                    });
                    if(!cartCount){
                        return await CartDetails.create({
                            cartId: cartDetail.id, 
                            patientId,
                            type,
                            mode,
                            referenceId,
                            companyId,
                            labId,
                            labType,
                            code
                        });
                    }else{
                        throw httpError(400, "This item already added into cart");
                    }
                }
            }else{
                const cartDetail = await Cart.create( { patientId,labId,labType,code} );
                if(cartDetail){
                    const cartCount = await CartDetails.findOne({
                        where: { cartId: cartDetail.id, patientId:patientId, type:type, referenceId:referenceId }
                    });
                    if(!cartCount){
                        return await CartDetails.create({
                            cartId: cartDetail.id, 
                            patientId,
                            type,
                            mode,
                            referenceId,
                            companyId,
                            labId,
                            labType,
                            code
                        });
                    }else{
                        throw httpError(400, "This item already added into cart");
                    }
                }
            }
        }   
        throw new Error("Error while adding item into cart");
    }

    static async getAllActiveCities() {
        try {
            return await LabCity.findAll({ 
                where: { isActive: true },
                attributes: ['id', 'cityName'],
                groupBy: ['cityName']
            });
        } catch (error) {
            throw new Error(error.message);
        }
    }

    static async getLabDetailsByCart_BK_Grouping(companyId, patientId, cityName) {
        const query = `
            SELECT DISTINCT
                c.id as cartId,
                cl.companyId,
                cl.mode,
                cl.labId,
                l.labName,
                l.description as labDescription,
                lc.id as labCityId,
                lc.cityName as labCityName,
                cl.price,
                cd.referenceId,
                cd.type
            FROM
                cart c
            LEFT JOIN
                cartDetails cd ON cd.cartId = c.id
            LEFT JOIN
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = cl.type
            LEFT JOIN
                labs l ON cl.labId = l.id
            LEFT JOIN
                labCities lc ON lc.cityName = :cityName
            WHERE
                c.patientId = :patientId
                AND c.isActive = 1
                AND cl.isActive = 1
                AND cl.companyId = :companyId
                AND lc.cityName = :cityName
        `;
        
        const results = await sequelizeDB1.query(query, {
            replacements: { companyId, patientId, cityName },
            type: QueryTypes.SELECT
        });
    
        // Organize results by referenceId
        const groupedLabDetails = results.reduce((acc, result) => {
            if (!acc[result.referenceId]) {
                acc[result.referenceId] = {
                    type: result.type,
                    referenceId: result.referenceId,
                    labDetails: []
                };
            }
            acc[result.referenceId].labDetails.push({
                labId: result.labId,
                labName: result.labName,
                labDescription: result.labDescription,
                labCityId: result.labCityId,
                labCityName: result.labCityName,
                price: result.price
            });
    
            return acc;
        }, {});
    
        // Convert the grouped data into the desired JSON format
        const labLists = Object.values(groupedLabDetails);
    
        return {
            cartId: results.length > 0 ? results[0].cartId : null,
            mode: results.length > 0 ? results[0].mode : null,
            companyId: results.length > 0 ? results[0].companyId : null,
            labLists
        };
    }    

    static async getLabDetailsByCart(companyId, patientId, cityName) {
        const query = `
            SELECT DISTINCT
                c.id as cartId,
                cl.companyId,
                cl.mode,
                cl.labId,
                l.labName,
                l.description as labDescription,
                lc.id as labCityId,
                lc.cityName as labCityName,
                cl.price
            FROM
                cart c
            LEFT JOIN
                cartDetails cd ON cd.cartId = c.id
            LEFT JOIN
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = cl.type
            LEFT JOIN
                labs l ON cl.labId = l.id
             LEFT JOIN 
                labBranches lb  ON cl.labId = lb.labId
            LEFT JOIN 
                labCities lc ON lc.id = lb.labCityId
            WHERE
                c.patientId = :patientId
                AND c.isActive = 1
                AND cl.isActive = 1
                AND lc.isActive = 1
                AND lc.cityName = :cityName
        `;

       

        //  AND cl.companyId = :companyId
        const results = await sequelizeDB1.query(query, {
            replacements: { companyId, patientId, cityName },
            type: QueryTypes.SELECT
        });

        // Transform results into the desired JSON format
        const labDetails = results.map(result => ({
            labId: result.labId,
            labName: result.labName,
            labDescription: result.labDescription,
            labCityId: result.labCityId,
            labCityName: result.labCityName,
            price: result.price
        }));

        return {
            cartId: results.length > 0 ? results[0].cartId : null,
            mode: results.length > 0 ? results[0].mode : null,
            companyId: results.length > 0 ? results[0].companyId : null,
            labDetails
        };
    }

    static async getBranchesByLabAndCity(labId, labCityId) {
        const query = `
            SELECT
                id,
                labId,
                labCityId,
                branchName,
                branchAddress
            FROM
                labBranches
            WHERE
                labId = :labId
                AND labCityId = :labCityId
                AND isActive = 1;
        `;
        
        return await sequelizeDB1.query(query, {
            replacements: { labId, labCityId },
            type: QueryTypes.SELECT
        });
    }

    static async getTestsAndPackagesByLab(companyId, search, labId, cartId) {
        const packageQuery = `
            WITH CartModes AS (
                SELECT DISTINCT mode
                FROM cartDetails
                WHERE cartId = :cartId
            ),
            ExcludedPackages AS (
                SELECT referenceId
                FROM cartDetails
                WHERE cartId = :cartId AND type = 2
            ),
            LabPackage AS (
                SELECT DISTINCT cp.labPackageId
                FROM connectedCompaniesLabPackages cp
                JOIN connectedLabs cl ON cl.referenceId = cp.labPackageId
                WHERE cl.labId = :labId
            )
            SELECT 
                cp.companyId, 
                cp.categoryId, 
                lp.id AS labPackageId, 
                lp.packageName, 
                MAX(cp.type) AS type,
                MAX(cp.mode) AS mode,
                lc.categoryname AS categoryName,
                MAX(lp.noOfTest) AS noOfTest,
                MAX(lp.price) AS price,
                GROUP_CONCAT(DISTINCT lt.name) AS tests
            FROM connectedCompaniesLabPackages cp
            JOIN connectedLabs cl ON cl.companyId = cp.companyId
            JOIN labPackages lp ON cp.labPackageId = lp.id
            JOIN labsCategory lc ON cp.categoryId = lc.id
            JOIN connectedLabTestPackages cltp ON lp.id = cltp.labPackageId
            JOIN labTests lt ON cltp.labTestId = lt.id
            LEFT JOIN cartDetails cd ON cd.referenceId = cp.labPackageId AND cd.type = 2 AND cd.cartId = :cartId
            WHERE cp.companyId = :companyId 
            AND cp.isActive = 1
            AND (cp.mode IN (SELECT mode FROM CartModes))
            AND cp.labPackageId NOT IN (SELECT referenceId FROM ExcludedPackages)
            AND (cp.labPackageId IN (SELECT labPackageId FROM LabPackage))
            ${search ? `AND (lp.packageName LIKE :search OR lt.name LIKE :search)` : ''}
            GROUP BY cp.companyId, cp.categoryId, lp.id, lc.categoryname
            ORDER BY lc.categoryname ASC`
        ;                   

        const testQuery = `
            WITH CartModes AS (
                SELECT DISTINCT mode
                FROM cartDetails
                WHERE cartId = :cartId
            ),
            ExcludedTests AS (
                SELECT referenceId
                FROM cartDetails
                WHERE cartId = :cartId AND type = 1
            ),
            LabTest AS (
                SELECT DISTINCT lt.id AS labTestId
                FROM connectedCompaniesLabTests ct
                JOIN labTests lt ON lt.id = ct.labTestId
                WHERE ct.companyId IN (
                    SELECT companyId
                    FROM connectedLabs
                    WHERE labId = :labId
                )
            )
            SELECT 
                ct.companyId, 
                ct.categoryId, 
                lt.id AS labTestId, 
                lt.name AS testName,
                MAX(ct.type) AS type,
                MAX(ct.mode) AS mode,
                lc.categoryname AS categoryName,
                lt.description
            FROM connectedCompaniesLabTests ct
            JOIN connectedLabs cl ON cl.companyId = ct.companyId
            JOIN labTests lt ON ct.labTestId = lt.id
            JOIN labsCategory lc ON ct.categoryId = lc.id
            LEFT JOIN cartDetails cd ON cd.referenceId = lt.id AND cd.type = 1 AND cd.cartId = :cartId
            WHERE ct.companyId = :companyId 
            AND ct.isActive = 1
            AND (ct.mode IN (SELECT mode FROM CartModes))
            AND (lt.id IN (SELECT labTestId FROM LabTest))
            AND lt.id NOT IN (SELECT referenceId FROM ExcludedTests)
            ${search ? `AND lt.name LIKE :search` : ''}
            GROUP BY ct.companyId, ct.categoryId, lt.id, lc.categoryname, lt.description
            ORDER BY lc.categoryname ASC`
        ;
    
        const [categoryPackages, categoryTests] = await Promise.all([
            sequelizeDB1.query(packageQuery, {
                replacements: { cartId, companyId, search: `%${search}%`, labId },
                type: QueryTypes.SELECT
            }),
            sequelizeDB1.query(testQuery, {
                replacements: { cartId, companyId, search: `%${search}%`, labId },
                type: QueryTypes.SELECT
            })
        ]);

        // Structuring the data as per the required format
       
        const structuredPackages = categoryPackages.reduce((acc, item) => {
            if (!acc[item.categoryName]) {
                acc[item.categoryName] = [];
            }
            acc[item.categoryName].push({
                companyId: item.companyId,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                packageId: item.labPackageId,
                packageName: item.packageName,
                packageType: item.type,
                packageMode: item.mode,
                noOfTest: item.noOfTest,
                price: item.price,
                tests: item.tests ? item.tests.split(',') : []
            });
            return acc;
        }, {});

        const structuredTests = categoryTests.reduce((acc, item) => {
            if (!acc[item.categoryName]) {
                acc[item.categoryName] = [];
            }
            acc[item.categoryName].push({
                companyId: item.companyId,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                testId: item.labTestId,
                testName: item.testName,
                testType: item.type,
                testMode: item.mode,
                description: item.description
            });
            return acc;
        }, {});

        return {
            packages: structuredPackages,
            tests: structuredTests
        };
    }

    static async getTestOrPackageDetails(id, type) {
        let query;
        let replacements = { id };

        if (type == 2) { // Package
            query = `
                SELECT
                p.id AS TestOrPackageId,
                p.packageName AS nameOfTest,
                p.notes AS description,
                p.mode AS mode,
                GROUP_CONCAT(DISTINCT t.requirements SEPARATOR ', ') AS requirementsBeforeTest,
                'package' AS typeOfTestOrPackage,
                p.price AS packagePrice,
                t.id AS testId,
                cltp.masterTestId as mId,
                t.name AS nameOfTestsInPackages,
                t.price AS testPrice,
                st.id AS subTestId,
                st.name AS nameOfSubTests,
                st.price AS subTestPrice
            FROM
                labPackages p
            JOIN
                connectedLabTestPackages cltp ON p.id = cltp.labPackageId
            JOIN
                labTests t ON cltp.labTestId = t.id
            LEFT JOIN
                subLabTests st ON t.id = st.labTestId AND  cltp.masterTestId = st.masterTestSubId

            WHERE
                 t.labId = (
                    SELECT t2.labId
                    FROM labTests t2
                    JOIN connectedLabTestPackages cltp2 ON t2.id = cltp2.labTestId
                    WHERE cltp2.labPackageId = :id
                    LIMIT 1
                )
                AND 
                p.id = :id
                AND p.isActive = 1
                AND st.isActive = 1
            GROUP BY
                p.id, t.id, st.id,cltp.masterTestId
            ORDER BY
                t.id, st.id;        
            `;
        } else if (type == 1) { // Test
            query = `
                SELECT
                    t.id AS TestOrPackageId,
                    t.name AS nameOfTest,
                    t.description,
                    t.mode AS mode,
                    t.requirements AS requirementsBeforeTest,
                    'test' AS typeOfTestOrPackage,
                    t.price AS testPrice,
                    st.id AS subTestId,
                    st.name AS nameOfSubTests,
                    st.price AS subTestPrice
                FROM
                    labTests t
                LEFT JOIN
                    subLabTests st ON t.id = st.labTestId
                WHERE
                    t.id = :id
                    AND t.isActive = 1;
            `;
        } else {
            throw new Error('Invalid type');
        }

        const details = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });

        // Structure the data to match the expected format
        if (type == 2) { // Package
            const packageDetails = details.reduce((acc, item) => {
                // Initialize the package object if it does not exist
                if (!acc.TestOrPackageId) {
                    acc = {
                        TestOrPackageId: item.TestOrPackageId,
                        nameOfTest: item.nameOfTest,
                        description: item.description,
                        requirementsBeforeTest: item.requirementsBeforeTest,
                        typeOfTestOrPackage: item.typeOfTestOrPackage,
                        modeOfTestOrPackage: item.mode,
                        packagePrice: item.packagePrice,
                        Tests: []
                    };
                }
            
                // Find the test in the existing tests array or create a new one
                let test = acc.Tests.find(t => t.testId === item.testId);
                if (!test) {
                    test = {
                        testId: item.testId,
                        nameOfTestsInPackages: item.nameOfTestsInPackages,
                        testPrice: item.testPrice,
                        subTests: []
                    };
                    acc.Tests.push(test);
                }
            
                // Add subTest if it exists
                if (item.subTestId) {
                    test.subTests.push({
                        subTestId: item.subTestId,
                        nameOfSubTests: item.nameOfSubTests,
                        subTestPrice: item.subTestPrice
                    });
                }
            
                return acc;
            }, {});
            return packageDetails;
        } else if (type == 1) { // Test
            const testDetails = details.reduce((acc, item) => {
                if (!acc.TestOrPackageId) {
                    acc = {
                        TestOrPackageId: item.TestOrPackageId,
                        nameOfTest: item.nameOfTest,
                        description: item.description,
                        requirementsBeforeTest: item.requirementsBeforeTest,
                        typeOfTestOrPackage: item.typeOfTestOrPackage,
                        modeOfTestOrPackage: item.mode,
                        testPrice: item.testPrice,
                        subTests: []
                    };
                }
                if (item.subTestId) {
                    acc.subTests.push({
                        subTestId: item.subTestId,
                        nameOfSubTests: item.nameOfSubTests,
                        subTestPrice: item.subTestPrice
                    });
                }
                return acc;
            }, {});
            return testDetails;
        }
    }

    static async removeCartItem(cartId, patientId) {
        // check cartId, only an item of the patient's own cart
        const queryCart = `
            SELECT cd.* FROM cartDetails cd
            INNER JOIN cart c ON c.id = cd.cartId AND c.patientId = :patientId
            WHERE cd.id = :cartId;
        `;

        const cartResult = await sequelizeDB1.query(queryCart, {
            replacements: { cartId, patientId },
            type: QueryTypes.SELECT
        });
        if (cartResult.length === 0) {
            throw httpError(404, 'Cart item not found');
        }
        const crId = cartResult[0].cartId;
        const query = `
            DELETE FROM cartDetails
            WHERE id = :cartId;
        `;
        await sequelizeDB1.query(query, {
            replacements: { cartId },
            type: QueryTypes.DELETE
        });

        if(crId){
            const queryCartAll = `
                SELECT * FROM cartDetails
                WHERE cartId = :crId;
                `;

            const cartResult = await sequelizeDB1.query(queryCartAll, {
                replacements: { crId },
                type: QueryTypes.SELECT
            });
            if(cartResult.length === 0){
                 const queryDelete = `
                    DELETE FROM cart
                    WHERE id = :crId;
                `;
                await sequelizeDB1.query(queryDelete, {
                    replacements: { crId },
                    type: QueryTypes.DELETE
                });
            }
        }

        return { success: true, message: 'Cart item removed successfully.' };
    }

    static async getCartDetailsByPatientId_BK(labId, patientId, cartId) {

        let query;
        const cartCount = await CartDetails.count({
            where: {
                cartId: cartId,
                isActive: true
            }
        });
        if(cartCount < 2){
            query = `
            WITH CartModes AS (
                SELECT DISTINCT mode
                FROM cartDetails
                WHERE cartId = :cartId
            ),
            MinPackagePrices AS (
                SELECT 
                    cd.referenceId,
                    MIN(cl.price) AS minPrice
                FROM 
                    cartDetails cd
                JOIN 
                    connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = 2
                WHERE 
                    cd.cartId = :cartId
                AND 
                    cl.isActive = 1
                GROUP BY 
                    cd.referenceId
            )
            SELECT DISTINCT
                c.id AS cartId,
                cd.id AS itemId,
                cd.type AS itemType,
                cd.mode AS itemMode,
                cd.referenceId,
                c.patientId,
                p.packageName,
                p.noOfTest,
                t.name AS testName,
                t.description,
                l.labName,
                l.description AS labDescription,
                CASE 
                    WHEN cd.type = 2 THEN cl.labId -- labId for packages
                    ELSE t.labId
                END AS labId,
                CASE 
                    WHEN cd.type = 2 THEN cl.price -- Price for packages
                    ELSE t.price
                END AS price,
                CASE 
                    WHEN cd.type = 2 THEN cl.discount -- Discount for packages
                    ELSE t.discount
                END AS discount
            FROM
                cart c
            LEFT JOIN
                cartDetails cd ON cd.cartId = c.id
            LEFT JOIN
                connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
            LEFT JOIN
                labPackages p ON ccpt.labPackageId = p.id
            LEFT JOIN
                connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
            LEFT JOIN
                labTests t ON cct.labTestId = t.id
            LEFT JOIN
                MinPackagePrices mpp ON cd.referenceId = mpp.referenceId
            LEFT JOIN
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cl.price = mpp.minPrice AND cl.isActive = 1
            LEFT JOIN
                labs l ON (cd.type = 2 AND cl.labId = l.id) OR (cd.type = 1 AND t.labId = l.id)
            WHERE
                c.id = :cartId
                AND c.patientId = :patientId
                AND cd.isDeleted = 0
                AND c.isActive = 1
                AND (
                    (cd.type = 2 AND cl.price IS NOT NULL) -- Ensure price for packages
                    OR (cd.type = 1 AND t.price IS NOT NULL) -- Ensure price for tests
                );
        `;
        }else{
            query = `
                WITH CartModes AS (
                    SELECT DISTINCT mode
                    FROM cartDetails
                    WHERE cartId = :cartId
                )
                SELECT DISTINCT
                    c.id AS cartId,
                    cd.id AS itemId,
                    cd.type AS itemType,
                    cd.mode AS itemMode,
                    cd.referenceId,
                    c.patientId,
                    p.packageName,
                    p.noOfTest,
                    t.name AS testName,
                    t.description,
                    l.labName,
                    l.description AS labDescription,
                    CASE 
                        WHEN cd.type = 2 THEN cl.labId -- labId for packages
                        ELSE t.labId
                    END AS labId,
                    CASE 
                        WHEN cd.type = 2 THEN cl.price -- Price for packages
                        ELSE t.price
                    END AS price,
                    CASE 
                        WHEN cd.type = 2 THEN cl.discount -- Discount for packages
                        ELSE t.discount
                    END AS discount
                FROM
                    cart c
                LEFT JOIN
                    cartDetails cd ON cd.cartId = c.id
                LEFT JOIN
                    connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
                LEFT JOIN
                    labPackages p ON ccpt.labPackageId = p.id
                LEFT JOIN
                    connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
                LEFT JOIN
                    labTests t ON cct.labTestId = t.id
                LEFT JOIN
                    connectedLabs cl ON cd.referenceId = cl.referenceId AND cl.labId = :labId AND cl.isActive = 1
                LEFT JOIN
                    labs l ON l.id = :labId
                WHERE
                    c.id = :cartId
                    AND c.patientId = :patientId
                    AND cd.isDeleted = 0
                    AND c.isActive = 1
                    AND (
                        (cd.type = 2 AND cl.price IS NOT NULL) -- Ensure price for packages
                        OR (cd.type = 1 AND t.price IS NOT NULL) -- Ensure price for tests
                    );                          
            `;
        }

        if(!cartCount){
            return await sequelizeDB1.query(query, {
                replacements: { cartId, patientId },
                type: QueryTypes.SELECT
            });
        }else{
            return await sequelizeDB1.query(query, {
                replacements: { labId, cartId, patientId },
                type: QueryTypes.SELECT
            });
        }
    }

    static async updateAddress(id, address, pincode, state, city, patientId){
        const updateData = {
            "patientId" : patientId,
            "address" : address,
            "zip_code" : pincode,
            "state" : state,
            "city" : city
        }
        if(id){
            // only the patient's own address row
            await LabTestBookingAddress.update(updateData, {
                where: { id, patientId }
            });
        }else{
            await LabTestBookingAddress.create(updateData);
        }

        return true;
    }

    static async getLabTestAddress(patientId) {
        const labTestDetail = await LabTestBookingAddress.findOne({
            where: { patientId },
            order: [['createdAt', 'DESC']]
        });
        return labTestDetail;
    }
    
    // callers check the cart belongs to the patient (getOwnedCart) first
    static async getLabDetail(cartId) {
        const query = `
            SELECT
                c.id AS cartId,
                l.id AS labId,
                l.labName,
                l.description as labDescription,
                lc.id as labCityId,
                lc.cityName as labCityName,
                lb.id AS labBranchId,
                lb.branchName,
                lb.branchAddress,
                l.labType
            FROM
                cart c
            LEFT JOIN
                labs l ON c.labId = l.id
            LEFT JOIN
                labCities lc ON c.labCityName = lc.cityName
            LEFT JOIN
                labBranches lb ON c.labBranchId = lb.id
            WHERE
                c.id = :cartId
                AND c.isActive = 1
                AND c.isDeleted = 0
                ;
        `;
        //AND lc.isActive = 1
        return await sequelizeDB1.query(query, {
            replacements: { cartId },
            type: QueryTypes.SELECT
        });
    }

    static async getCartDetailsByCart(cartId) {
        const query = `
        SELECT
            cd.id AS itemId,
            cl.price,
            cl.discount,
            cl.labCode,
            l.labName,
            l.labType
        FROM
            cartDetails cd
        LEFT JOIN
            cart c ON c.id = cd.cartId
        LEFT JOIN
            connectedLabs cl ON cd.referenceId = cl.referenceId 
            AND c.labId = cl.labId
            AND cd.type = cl.type
            AND cd.mode = cl.mode
        LEFT JOIN 
            labs l ON c.labId = l.id

        WHERE
            cd.cartId = :cartId
            AND cd.isActive = 1
            AND cd.isDeleted = 0;
        `;
    
        const results = await sequelizeDB1.query(query, {
            replacements: { cartId },
            type: QueryTypes.SELECT
        });

        return results;
    }

    // Patient reschedules their own pending/confirmed order. Same booking rules as the cart:
    // not today or tomorrow, and radiology not on Sunday. Redcliff orders use Redcliff slots, so they are excluded.
    static async rescheduleLabOrder(orderId, patientId, bookingDate, bookingTime) {
        const order = await LabOrder.findOne({
            where: { id: orderId, patientId, isActive: true, isDeleted: false }
        });
        if (!order) {
            return { status: 404, message: 'Lab order not found' };
        }
        // 'confirmed' is set by the care navigator's approval (also covers orders approved before approved_by existed)
        if (order.approvedBy || order.orderStatus === 'confirmed') {
            return { status: 400, message: LAB_ORDER_APPROVED_MESSAGE };
        }
        if (!['pending', 'confirmed', 'Payment Completed'].includes(order.orderStatus)) {
            return { status: 400, message: `A ${order.orderStatus} order cannot be rescheduled` };
        }
        if (order.labType === 'Redcliff') {
            return { status: 400, message: 'This order cannot be rescheduled online' };
        }
        // only allowed more than 2 days (48 hours) before the currently booked slot starts
        const currentStart = bookingStartTime(order.bookingDate, order.bookingTime);
        if (currentStart && currentStart.getTime() - Date.now() <= 2 * 24 * 60 * 60 * 1000) {
            return { status: 400, message: LAB_RESCHEDULE_WINDOW_MESSAGE };
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate || '')) {
            return { status: 400, message: 'Valid bookingDate (YYYY-MM-DD) is required' };
        }
        const date = new Date(`${bookingDate}T00:00:00`);
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + 2);
        if (isNaN(date.getTime()) || date < minDate) {
            return { status: 400, message: 'Booking date must be at least 2 days from today' };
        }

        const [detail] = await sequelizeDB1.query(
            "SELECT MAX(mode = 'Radiology') AS hasRadiology FROM labOrderDetails WHERE labOrderId = :orderId",
            { replacements: { orderId }, type: QueryTypes.SELECT }
        );
        const isRadiology = Number(detail?.hasRadiology) === 1;
        if (isRadiology && date.getDay() === 0) {
            return { status: 400, message: 'Radiology tests cannot be booked on Sunday' };
        }
        const allowedTimes = isRadiology
            ? ['8:00 AM to 9:00 AM']
            : ['6:00 AM to 7:00 AM', '6:30 AM to 7:30 AM', '7:00 AM to 8:00 AM', '7:30 AM to 8:30 AM', '8:00 AM to 9:00 AM', '8:30 AM to 9:30 AM', '9:00 AM to 10:00 AM', '9:30 AM to 10:30 AM', '10:00 AM to 11:00 AM', '10:30 AM to 11:30 AM'];
        if (!allowedTimes.includes(bookingTime)) {
            return { status: 400, message: 'Please select a valid time slot' };
        }

        const previousSlot = { date: order.bookingDate, time: order.bookingTime };
        await order.update({ bookingDate, bookingTime, rescheduledBy: patientId });
        // not awaited: emails must not hold up the reschedule response
        this.notifyReschedule(order, previousSlot)
            .catch((err) => console.error('Reschedule notification failed:', err));
        return { status: 200, message: 'Lab test rescheduled successfully', order: { id: order.id, bookingDate, bookingTime } };
    }

    // patient rescheduled: email the request to the care navigators and an acknowledgement to the patient
    static async notifyReschedule(order, previousSlot) {
        const patient = await Patient.findOne({ where: { id: order.patientId } });
        if (!patient) return;
        const emailData = await this.getHealthCheckupEmailData(order, patient);
        const details = {
            customerName: emailData.name,
            corporateName: emailData.corporateName,
            currentDate: previousSlot.date,
            currentTime: previousSlot.time,
            location: emailData.location,
            preferredDate: order.bookingDate,
            preferredTime: order.bookingTime,
            requestId: emailData.requestId,
        };

        if (patient.email) {
            const { subject, html } = EmailTemplates.healthCheckupRescheduleAcknowledgement(details);
            await emailHelperSMTP(patient.id, patient.email, subject, html);
        }

        const careNavigators = await this.getCareNavigatorsForPatient(patient);
        for (const row of careNavigators) {
            // one failure must not stop the remaining care navigators from being notified
            try {
                const { subject, html } = EmailTemplates.healthCheckupRescheduleRequest({ ...details, careNavigatorName: row.name });
                if (row.email) await emailHelperSMTP(row.id, row.email, subject, html);
                await NotificationService.createNotification({
                    "title": "Health Check-up Rescheduling Request",
                    "description": `${emailData.name} rescheduled booking ${emailData.requestId} from ${previousSlot.date} at ${previousSlot.time} to ${order.bookingDate} at ${order.bookingTime}.`,
                    "referenceId": row.id,
                    "role": "careNavigator"
                });
            } catch (err) {
                console.error(`Care navigator ${row.id} reschedule notification failed:`, err);
            }
        }
    }

    // sub-city carts have no lab: price each item from connectedLabs by referenceId + type + mode,
    // taking the lowest active price (same rule the cart uses for package prices)
    static async getSubCityCartPrices(cartId, patientId) {
        const query = `
        SELECT
            cd.id AS itemId,
            (
                SELECT cl.price FROM connectedLabs cl
                WHERE cl.referenceId = cd.referenceId AND cl.type = cd.type AND cl.mode = cd.mode AND cl.isActive = 1
                ORDER BY cl.price ASC, cl.id ASC LIMIT 1
            ) AS price,
            (
                SELECT cl.discount FROM connectedLabs cl
                WHERE cl.referenceId = cd.referenceId AND cl.type = cd.type AND cl.mode = cd.mode AND cl.isActive = 1
                ORDER BY cl.price ASC, cl.id ASC LIMIT 1
            ) AS discount
        FROM
            cartDetails cd
        INNER JOIN
            cart c ON c.id = cd.cartId AND c.patientId = :patientId
        WHERE
            cd.cartId = :cartId
            AND cd.isActive = 1
            AND cd.isDeleted = 0;
        `;
        return sequelizeDB1.query(query, {
            replacements: { cartId, patientId },
            type: QueryTypes.SELECT
        });
    }

    static async getCartDetailsByPatientId(patientId) {

        let query;
        let cartId;
        let labId;
        let querySingleItemFetch;
        // const patientDetail = await Patient.findOne({
        //     where: {
        //         id: patientId
               
        //     },
        //     attributes: ['companyId']
          
        // });
       
        const cart = await Cart.findOne({
            where: {
                patientId: patientId,
                isActive: true
            }
        });
        if(cart){
            cartId = cart.id;
          //  const companyId = patientDetail.dataValues.companyId;
        // if(cartCount > 0 && cartCount < 2){ //This case will run only when cart is having single Item
        // note cd.mode = 1 means Pathology
        query =    `WITH CartModes AS (
            SELECT DISTINCT mode
            FROM cartDetails
            WHERE cartId =  :cartId
        ),
        MinPackagePrices AS (
            SELECT 
                cd.referenceId,
                MIN(cl.price) AS minPrice
            FROM 
                cartDetails cd
            JOIN 
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = 2
            WHERE 
                cd.cartId = :cartId
                AND cl.isActive = 1
            GROUP BY 
                cd.referenceId
        )
        SELECT DISTINCT
            c.id AS cartId,
            c.labId AS cartLabId,
            c.labType AS cartLabType,
            c.code AS cartCode,

            cd.id AS itemId,
            cd.type AS itemType,
            cd.mode AS itemMode,
            cd.referenceId,
            cd.companyId,
            cd.labId AS labId11,
            cd.labType AS labType,
            cd.code AS code,                
            cd.patientId,
            p.packageName,
            p.noOfTest,
            pa.address1 AS address,
            pa.city,
            pa.state,
            pa.zip_code AS pincode,
            t.name AS testName,
            t.description,
            cl.companyId,
            cl.labCode,
            l.labType,
            CASE 
                WHEN cd.mode = 'Pathology' THEN l.labName
                ELSE NULL
            END AS labName,
            CASE 
                WHEN cd.mode = 'Pathology' THEN l.description
                ELSE NULL
            END AS labDescription,
            CASE 
                WHEN cd.mode = 'Pathology' AND cl.labId IS NOT NULL THEN cl.labId
                    WHEN cd.labId IS NOT NULL AND cd.labId <> '' THEN cd.labId
                    ELSE NULL
                END AS labId,
            CASE 
                WHEN cd.mode = 'Pathology' THEN cl.price
                ELSE 
                 NULL
            END AS price,
            CASE 
                WHEN cd.mode = 'Pathology' THEN cl.discount
                ELSE NULL
            END AS discount
        FROM
            cart c
        LEFT JOIN
            patient pa ON pa.id = :patientId
        LEFT JOIN
            cartDetails cd ON cd.cartId = c.id
        LEFT JOIN
            connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
        LEFT JOIN
            labPackages p ON ccpt.labPackageId = p.id
        LEFT JOIN
            connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
        LEFT JOIN
            labTests t ON cct.labTestId = t.id
        LEFT JOIN
            MinPackagePrices mpp ON cd.referenceId = mpp.referenceId
        LEFT JOIN
            connectedLabs cl ON cd.referenceId = cl.referenceId 
            AND cl.type = cd.type 
            AND cl.isActive = 1 
            AND cd.companyId = cl.companyId
            AND cl.price = mpp.minPrice   -- ✅ Only select lab with minimum price
        LEFT JOIN
            labs l ON t.labId = l.id
        WHERE
            c.id = :cartId
            AND c.patientId = :patientId
            AND cd.isDeleted = 0
            AND c.isActive = 1              
            AND (
                (cd.mode = 'Radiology' AND cl.price IS NOT NULL)
                OR (cd.mode = 'Pathology' AND cd.type = 1 AND t.price IS NOT NULL)
                OR (cd.mode = 'Pathology' AND cd.type = 2 AND cl.price IS NOT NULL)
            );`
        /* commented by mohan 
            query = `
            WITH CartModes AS (
                SELECT DISTINCT mode
                FROM cartDetails
                WHERE cartId = :cartId
            ),
            MinPackagePrices AS (
                SELECT 
                    cd.referenceId,
                    MIN(cl.price) AS minPrice
                FROM 
                    cartDetails cd
                JOIN 
                    connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = 2
                WHERE 
                    cd.cartId = :cartId
                AND 
                    cl.isActive = 1
                GROUP BY 
                    cd.referenceId
            )
            SELECT DISTINCT
                c.id AS cartId,
                c.labId as cartLabId,
                c.labType as cartLabType,
                c.code as cartCode,

                cd.id AS itemId,
                cd.type AS itemType,
                cd.mode AS itemMode,
                cd.referenceId,
                cd.companyId,
                cd.labId as labId,
                cd.labType as labType,
                cd.code as code,                
                cd.patientId,
                p.packageName,
                p.noOfTest,
                pa.address1 AS address,
                pa.city,
                pa.state,
                pa.zip_code AS pincode,
                t.name AS testName,
                t.description,
                cl.companyId,
                CASE 
                    WHEN cd.mode = 'Pathology' THEN l.labName -- labName for packages
                    ELSE NULL
                END AS labName,
                CASE 
                    WHEN cd.mode = 'Pathology' THEN l.description -- labDescription for packages
                    ELSE NULL
                END AS labDescription,
                CASE 
                    WHEN cd.mode = 'Pathology' THEN cl.labId -- labId for packages
                    ELSE NULL
                END AS labIdl,
                CASE 
                    WHEN cd.mode ='Pathology' THEN cl.price -- Price for packages
                    ELSE NULL
                END AS price,
                CASE 
                    WHEN cd.mode = 'Pathology' THEN cl.discount -- Discount for packages
                    ELSE NULL
                END AS discount
            FROM
                cart c
            LEFT JOIN
                patient pa ON pa.id = :patientId
            LEFT JOIN
                cartDetails cd ON cd.cartId = c.id
            LEFT JOIN
                connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
            LEFT JOIN
                labPackages p ON ccpt.labPackageId = p.id
            LEFT JOIN
                connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
            LEFT JOIN
                labTests t ON cct.labTestId = t.id
            LEFT JOIN
                MinPackagePrices mpp ON cd.referenceId = mpp.referenceId
            LEFT JOIN
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cl.type = cd.type AND cl.isActive = 1 and cd.companyId = cl.companyId
            LEFT JOIN
                labs l ON cl.labId = l.id
            WHERE
                c.id = :cartId
                AND c.patientId = :patientId
                AND cd.isDeleted = 0
                AND c.isActive = 1              
                AND (
                    (cd.mode = 'Radiology' AND cl.price IS NOT NULL) -- Ensure price for radiology
                    OR (cd.mode = 'Pathology' AND cd.type = 1 AND t.price IS NOT NULL) -- Ensure price for pathology
                    OR (cd.mode = 'Pathology' AND cd.type = 2 AND cl.price IS NOT NULL) -- Ensure price for pathology
                ); 
        `; */
        
        // }else{
            // querySingleItemFetch = await this.getSingleCartItemQuery();
            // query = `
            //     WITH CartModes AS (
            //         SELECT DISTINCT mode
            //         FROM cartDetails
            //         WHERE cartId = :cartId
            //     )
            //     MinPackagePrices AS (
            //         SELECT 
            //             cd.referenceId,
            //             MIN(cl.price) AS minPrice
            //         FROM 
            //             cartDetails cd
            //         JOIN 
            //             connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = 2
            //         WHERE 
            //             cd.cartId = :cartId
            //         AND 
            //             cl.isActive = 1
            //         GROUP BY 
            //             cd.referenceId
            //     )
            //     SELECT DISTINCT
            //         c.id AS cartId,
            //         cd.id AS itemId,
            //         cd.type AS itemType,
            //         cd.mode AS itemMode,
            //         cd.referenceId,
            //         c.patientId,
            //         p.packageName,
            //         p.noOfTest,
            //         t.name AS testName,
            //         t.description,
            //         CASE 
            //             WHEN cd.mode = 1 THEN l.labName -- labName for packages
            //             ELSE NULL
            //         END AS labName,
            //         CASE 
            //             WHEN cd.mode = 1 THEN l.description -- labDescription for packages
            //             ELSE NULL
            //         END AS labDescription,
            //         CASE 
            //             WHEN cd.mode = 1 THEN cl.labId -- labId for packages
            //             ELSE NULL
            //         END AS labId,
            //         CASE 
            //             WHEN cd.mode = 1 THEN cl.price -- Price for packages
            //             ELSE NULL
            //         END AS price,
            //         CASE 
            //             WHEN cd.mode = 1 THEN cl.discount -- Discount for packages
            //             ELSE NULL
            //         END AS discount
            //     FROM
            //         cart c
            //     LEFT JOIN
            //         cartDetails cd ON cd.cartId = c.id
            //     LEFT JOIN
            //         connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
            //     LEFT JOIN
            //         labPackages p ON ccpt.labPackageId = p.id
            //     LEFT JOIN
            //         connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
            //     LEFT JOIN
            //         labTests t ON cct.labTestId = t.id
            //     LEFT JOIN
            //         connectedLabs cl ON cd.referenceId = cl.referenceId AND cl.labId = c.labId AND cl.isActive = 1
            //     LEFT JOIN
            //         labs l ON l.id = c.labId
            //     WHERE
            //         c.id = :cartId
            //         AND c.patientId = :patientId
            //         AND cd.isDeleted = 0
            //         AND c.isActive = 1
            //         AND (
            //             (cd.mode = 2 AND cl.price IS NOT NULL) -- Ensure price for radiology
            //             OR (cd.mode = 1 AND cd.type = 1 AND t.price IS NOT NULL) -- Ensure price for pathology
            //             OR (cd.mode = 1 AND cd.type = 2 AND cl.price IS NOT NULL) -- Ensure price for pathology
            //         );                          
            // `;
        // }

        // if(cartCount > 0 && cartCount < 2){
        //     return await sequelizeDB1.query(query, {
        //         replacements: { cartId, patientId },
        //         type: QueryTypes.SELECT
        //     });
        // }else{
                // const cartIdData = await sequelizeDB1.query(querySingleItemFetch, {
                //     replacements: { cartId, patientId },
                //     type: QueryTypes.SELECT
                // });
                // labId = cartIdData.length > 1 ? cartIdData[0].labId : 0;
                // console.log(labId,'labId===');
        return await sequelizeDB1.query(query, {
            replacements: { cartId, patientId},
            type: QueryTypes.SELECT
        });
        // }
        }else{
            throw new Error("Your cart is empty!");
        }
    }

    static async getSingleCartItemQuery(){
      const query = `
        WITH CartModes AS (
            SELECT DISTINCT mode
            FROM cartDetails
            WHERE cartId = :cartId
        ),
        MinPackagePrices AS (
            SELECT 
                cd.referenceId,
                MIN(cl.price) AS minPrice
            FROM 
                cartDetails cd
            JOIN 
                connectedLabs cl ON cd.referenceId = cl.referenceId AND cd.type = 2
            WHERE 
                cd.cartId = :cartId
            AND 
                cl.isActive = 1
            GROUP BY 
                cd.referenceId
        )
        SELECT DISTINCT
            c.id AS cartId,
            cd.id AS itemId,
            cd.type AS itemType,
            cd.mode AS itemMode,
            cd.referenceId,
            c.patientId,
            p.packageName,
            p.noOfTest,
            t.name AS testName,
            t.description,
            CASE 
                WHEN cd.mode = 1 THEN l.labName -- labName for packages
                ELSE NULL
            END AS labName,
            CASE 
                WHEN cd.mode = 1 THEN l.description -- labDescription for packages
                ELSE NULL
            END AS labDescription,
            CASE 
                WHEN cd.mode = 1 THEN cl.labId -- labId for packages
                ELSE NULL
            END AS labId,
            CASE 
                WHEN cd.mode = 1 THEN cl.price -- Price for packages
                ELSE NULL
            END AS price,
            CASE 
                WHEN cd.mode = 1 THEN cl.discount -- Discount for packages
                ELSE NULL
            END AS discount
        FROM
            cart c
        LEFT JOIN
            cartDetails cd ON cd.cartId = c.id
        LEFT JOIN
            connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
        LEFT JOIN
            labPackages p ON ccpt.labPackageId = p.id
        LEFT JOIN
            connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
        LEFT JOIN
            labTests t ON cct.labTestId = t.id
        LEFT JOIN
            MinPackagePrices mpp ON cd.referenceId = mpp.referenceId
        LEFT JOIN
            connectedLabs cl ON cd.referenceId = cl.referenceId AND cl.price = mpp.minPrice AND cl.isActive = 1
        LEFT JOIN
            labs l ON (cd.type = 2 AND cl.labId = l.id) OR (cd.type = 1 AND t.labId = l.id)
        WHERE
            c.id = :cartId
            AND c.patientId = :patientId
            AND cd.isDeleted = 0
            AND c.isActive = 1
            AND (
                (cd.type = 2 AND cl.price IS NOT NULL) -- Ensure price for packages
                OR (cd.type = 1 AND t.price IS NOT NULL) -- Ensure price for tests
            );
    `;

    return query;
    }
    static async getPrescriptionUrl(patientId) {
        const prescription = await LabTestPrescription.findAll({
            where: {
                patientId: patientId,
                isActive: true,
                isDeleted: false
            },
            attributes: ['id', 'prescriptionFile'] 
        });

        if (!prescription) {
            throw new Error('Prescription not found');
        }

        return prescription;
    }

    static async deletePrescription(prescriptionId) {
        const prescription = await LabTestPrescription.findOne({
            where: {
                id: prescriptionId,
                isActive: true,
                isDeleted: false
            }
        });

        if (!prescription) {
            throw new Error('Prescription not found');
        }

        prescription.isActive = false;
        prescription.isDeleted = true;
        await prescription.save();

        return prescription;
    }

    // Request ID shown to patients and care navigators: random 8 digits, checked against existing
    // orders (including IDs migrated from the old system) so two bookings never share one
    static async generateUniqueBookingId() {
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = String(Math.floor(10000000 + Math.random() * 90000000));
            const taken = await LabOrder.count({ where: { uniqueBookingId: candidate } });
            if (!taken) return candidate;
        }
        throw new Error('Could not generate a unique booking id');
    }

    static async createLabOrder(data) {
        const { orderDetails, ...orderData } = data;
        const transaction = await sequelizeDB1.transaction();
        
        try {
            const labOrder = await LabOrder.create(orderData, { transaction });
            
            const labOrderDetails = orderDetails.map(detail => ({
                ...detail,
                labOrderId: labOrder.id,
                patientId: orderData.patientId
            }));
            
            await LabOrderDetails.bulkCreate(labOrderDetails, { transaction });
            
            await transaction.commit();
            
            return labOrder;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    static async getLabOrdersByPatientId(orderId) {
        const query = `
          SELECT 
    lo.id AS id,
    lo.patientId,
    lo.bookingDate,
    lo.bookingTime,
    labAddress.address AS bookingAddress,
    labAddress.state AS state,
    labAddress.city AS city,
    labAddress.zip_code AS zip_code,   
    lo.labId,
    lo.labCityName,
    lo.labBranchId,
    lo.price,
    lo.discountApplied,
    lo.otherCharges,
    lo.totalPrice,
    lo.isPaid,
    lo.orderStatus,
    lo.paymentStatus,
    lo.isActive,
    lo.isDeleted,
    lo.createdAt,
    lo.updatedAt,

    lod.id AS detailId,
    lod.labOrderId,
    lod.patientId AS detailPatientId,
    lod.type AS detailType,
    lod.referenceId,
    lod.name,
    lod.mode,
    lod.noOfTest AS detailNoOfTest,
    lod.price AS detailPrice,
    lod.discount AS detailDiscount,
    lod.total AS detailTotal,
    lod.isActive AS detailIsActive,
    lod.isDeleted AS detailIsDeleted,
    lod.createdAt AS detailCreatedAt,
    lod.updatedAt AS detailUpdatedAt,
    lod.companyIdPackageTest,
    lod.patientCompanyId,

    com.is_pament_required,
    p.first_name,
    p.email,
    p.dateofbirth,
    p.phone,
    p.parent_id AS patientParentId,

    /* isFree of the company package (NULL when the item is not a company package) */
    (
        SELECT MIN(ccp.isFree)
        FROM connectedCompaniesLabPackages ccp
        WHERE ccp.companyId = lod.companyIdPackageTest
          AND ccp.labPackageId = lod.referenceId
          AND lod.type = 'Package'
    ) AS packageIsFree,

    /* Check previous successful order */
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM labOrders previousOrder
            INNER JOIN labOrderDetails previousDetail
                ON previousOrder.id = previousDetail.labOrderId
            WHERE 
                previousOrder.patientId = lo.patientId

                /* Same company */
                AND previousDetail.patientCompanyId = lod.patientCompanyId

                /* Same package/test */
                AND previousDetail.referenceId = lod.referenceId

                /* Do not check current order */
                AND previousOrder.id <> lo.id

                /* Successful orders only */
                AND previousOrder.orderStatus IN (
                    'confirmed',
                    'Report Generated',
                     'Payment Completed',
                     'Completed',
                     'Reschedule',
                     'Result Awaited'

                )

                /* Active records only */
                AND previousOrder.isActive = true
                AND previousOrder.isDeleted = false
                AND previousDetail.isActive = true
                AND previousDetail.isDeleted = false
        )
        THEN 1
        ELSE 0
    END AS alreadyOrdered

FROM labOrders lo

LEFT JOIN labOrderDetails lod 
    ON lo.id = lod.labOrderId
LEFT JOIN patient p 
    ON lo.patientId = p.id

LEFT JOIN worksman_company_list com 
    ON lod.patientCompanyId = com.id

LEFT JOIN labTestBookingAddress AS labAddress 
    ON lo.patientId = labAddress.patientId
    AND labAddress.createdAt = (
        SELECT MAX(a.createdAt)
        FROM labTestBookingAddress a
        WHERE a.patientId = lo.patientId
    )

WHERE 
    lo.id = :orderId
    AND lo.isActive = true
    AND lo.isDeleted = false;
        `;

        const results = await sequelizeDB1.query(query, {
            replacements: { orderId },
            type: QueryTypes.SELECT
        });
        
        const orders = results.reduce((acc, row) => {
            const {
                id,
                patientId,
                bookingDate,
                bookingTime,
                bookingAddress,
                labId,
                labCityName,
                labBranchId,
                price,
                discountApplied,
                otherCharges,
                totalPrice,
                isPaid,
                orderStatus,
                paymentStatus,
                noOfTest,
                isActive,
                isDeleted,
                createdAt,
                updatedAt,
                detailId,
                labOrderId,
                detailPatientId,
                detailType,
                referenceId,
                name,
                mode,
                detailNoOfTest,
                detailPrice,
                detailDiscount,
                detailTotal,
                detailIsActive,
                detailIsDeleted,
                detailCreatedAt,
                detailUpdatedAt,
                companyIdPackageTest,
                patientCompanyId,
                is_pament_required,
                alreadyOrdered,
                patientParentId,
                packageIsFree,
                state,
                city,
                zip_code,

                first_name,
                email,
                dateofbirth,
                phone

            } = row;

            let order = acc.find(o => o.id === id);
            if (!order) {
                order = {
                    id,
                    patientId,
                    bookingDate,
                    bookingTime,
                    bookingAddress,
                    labId,
                    labCityName,
                    labBranchId,
                    price,
                    discountApplied,
                    otherCharges,
                    totalPrice,
                    isPaid,
                    state,
                    city,
                    zip_code,
                    first_name,
                    email,
                    dateofbirth,
                    phone,
                    orderStatus,
                    paymentStatus,
                    noOfTest,
                    isActive,
                    isDeleted,
                    createdAt,
                    updatedAt,
                    orderDetails: []
                };
                acc.push(order);
            }
            
         
            if (detailId) {       

                order.orderDetails.push({
                    id: detailId,
                    labOrderId,
                    patientId: detailPatientId,
                    type: detailType,
                    referenceId,
                    name,
                    mode,
                    noOfTest: detailNoOfTest,
                    price: detailPrice,
                    discount: detailDiscount,
                    total: detailTotal,
                    isActive: detailIsActive,
                    isDeleted: detailIsDeleted,
                    createdAt: detailCreatedAt,
                    updatedAt: detailUpdatedAt,                  
                   // isFree : is_pament_required === 1 ? 0 : companyIdPackageTest === patientCompanyId ? alreadyOrdered === 1 ? 0 : 1  : 0
                   // dependents (patient.parent_id > 0) always pay, even for the company's assigned package
                   // company package with isFree = 0 is always paid; isFree = 1 keeps the existing checks
                   isFree: packageIsFree !== null && Number(packageIsFree) === 0 ? 0 : Number(patientParentId) > 0 ? 0 : is_pament_required === 1 ? 0 : alreadyOrdered === 1 ? 0 : companyIdPackageTest === patientCompanyId ? 1 : 0

                });                
            }

            return acc;
        }, []);

        return orders;
    }

    // options.cancelledBy: who cancelled (shown in the care navigator cancellation email)
    static async updateLabOrder(orderId, updateData, response, options = {}) {

         const orderDetailPrev = await LabOrder.findOne({
            where: { id: orderId }
        });

        const result = await LabOrder.update(updateData, {
            where: { id: orderId }
        });
        const status = updateData.orderStatus;
        const orderDetail = await LabOrder.findOne({
            where: { id: orderId }
        });
        const patient = await Patient.findOne({ where: { id: orderDetail.patientId } });
        // Request ID shown in every booking email
        const requestId = orderDetail.uniqueBookingId || orderDetail.id;
        // get company id of the patient    

        // check care plan

        const planAvail = `
            SELECT 
                lo.id,
                lo.patientId,
                lod.referenceId,
                sp.packageId,
                cp.packageName,
                sp.planKey,
                sp.planValue,
                sp.company_package_id
            FROM labOrders AS lo
            LEFT JOIN labOrderDetails AS lod 
                ON lo.id = lod.labOrderId
            LEFT JOIN carePlans AS cp 
                ON lod.patientCompanyId = :companyId
            LEFT JOIN subscriptionPlans AS sp 
                ON cp.id = sp.packageId 
                AND lod.referenceId = sp.company_package_id
            WHERE 
                (lo.orderStatus = 'confirmed' 
                OR lo.orderStatus = 'Report Generated')
                AND lo.patientId = :patientId
                AND sp.isDeleted = 0
        `;

        const patientId = patient.id;
        const companyId = patient.employer_id;

        const packageDetails = await sequelizeDB1.query(planAvail, {
            replacements: {
                patientId,
                companyId
            },
            type: QueryTypes.SELECT
        });
        for (const packageData of packageDetails) {
            const existingPlan = await SubscriptionPlanAvail.findOne({
                where: {
                    patient_id: patientId,
                    reference_id: packageData.company_package_id,
                    company_id: companyId,
                    care_plan_id: packageData.packageId,
                    type: 'package'
                }
            });
            if (existingPlan) {
                if (existingPlan.status === 0) {
                    await existingPlan.update({
                        status: 1
                    });
                }

            } else {

                await SubscriptionPlanAvail.create({
                    patient_id: patientId,
                    planKey: packageData.planKey,
                    reference_id: packageData.company_package_id,
                    company_id: companyId,
                    care_plan_id: packageData.packageId,
                    status: 1,
                    type: 'package'
                });
            }
        
        }

       // const careNavigator = CareNavigator
        if(status == "confirmed" || status == "Payment Completed"){ // Send Notifications
            // Payment Completed = request placed, awaiting lab confirmation; confirmed = slot confirmed
            const isConfirmed = status == "confirmed";
            const emailData = await this.getHealthCheckupEmailData(orderDetail, patient);
            const template = isConfirmed ? EmailTemplates.healthCheckupConfirmed : EmailTemplates.healthCheckupRequestReceived;
            // not awaited: a slow SMTP server must not hold up the booking API response
            emailHelperSMTP(orderDetail.patientId, patient.email, ...Object.values(template(emailData)))
                .catch((err) => console.error('Health check-up email failed:', err));
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been successfully confirmed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : isConfirmed ? "Lab Booking Confirmed" : "Health Check-up Request Received",
                "description": isConfirmed
                    ? `Your Health Check-up appointment (Booking ID ${emailData.requestId}) is confirmed for ${emailData.date} at ${emailData.time}.`
                    : `We have received your Health Check-up request (Request ID ${emailData.requestId}). We will notify you once it is confirmed.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            Promise.resolve(NotificationService.createNotification(patientNotifyData))
                .catch((err) => console.error('Patient notification failed:', err));
            this.notifyCareNavigators(patient, emailData, isConfirmed ? 'confirmed' : 'review')
                .catch((err) => console.error('Care navigator notification failed:', err));

        }
        if(status == "cancelled"){ // Send Notifications
            const emailData = await this.getHealthCheckupEmailData(orderDetail, patient);
            // not awaited: a slow SMTP server must not hold up the cancel API response
            emailHelperSMTP(orderDetail.patientId, patient.email, ...Object.values(EmailTemplates.healthCheckupCancelled(emailData)))
                .catch((err) => console.error('Health check-up cancelled email failed:', err));
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been cancelled. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Health Check-up Cancelled",
                "description": `Your health check-up appointment (Booking ID ${requestId}) on ${orderDetail.bookingDate} at ${orderDetail.bookingTime} has been cancelled.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            Promise.resolve(NotificationService.createNotification(patientNotifyData))
                .catch((err) => console.error('Patient notification failed:', err));
            this.notifyCareNavigators(patient, emailData, 'cancelled', { cancelledBy: options.cancelledBy })
                .catch((err) => console.error('Care navigator notification failed:', err));
        }
        if(status == "Completed"){ // Send Notifications
            const emailData = await this.getHealthCheckupEmailData(orderDetail, patient);
            // not awaited: a slow SMTP server must not hold up the API response
            emailHelperSMTP(orderDetail.patientId, patient.email, ...Object.values(EmailTemplates.healthCheckupCompleted(emailData)))
                .catch((err) => console.error('Health check-up completed email failed:', err));
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been Completed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Health Check-up Completed",
                "description": `Your health check-up (Booking ID ${requestId}) has been completed. We will notify you when your report is available.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            Promise.resolve(NotificationService.createNotification(patientNotifyData))
                .catch((err) => console.error('Patient notification failed:', err));
            this.notifyCareNavigators(patient, emailData, 'completed')
                .catch((err) => console.error('Care navigator notification failed:', err));
        }
        if(status == "Report Generated"){ // Send Notifications
            const emailData = await this.getHealthCheckupEmailData(orderDetail, patient);
            // report is one file per order (uploaded separately); its file name serves as the Report ID
            const reportUrl = orderDetail.labReportURL;
            const reportId = reportUrl ? decodeURIComponent(String(reportUrl).split('?')[0].split('/').pop()) : undefined;
            const portalStatus = reportUrl ? 'Available' : 'Pending';
            // not awaited: a slow SMTP server must not hold up the API response
            emailHelperSMTP(orderDetail.patientId, patient.email, ...Object.values(EmailTemplates.healthCheckupReportReady(emailData)))
                .catch((err) => console.error('Health check-up report email failed:', err));
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Health Check-up Report Ready",
                "description": `Your health check-up report (Booking ID ${requestId}) is ready. View it in the portal.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            Promise.resolve(NotificationService.createNotification(patientNotifyData))
                .catch((err) => console.error('Patient notification failed:', err));
            this.notifyCareNavigators(patient, emailData, 'reportGenerated', { reportId, portalStatus })
                .catch((err) => console.error('Care navigator notification failed:', err));
        }
          if(status == "Reschedule"){ // Send Notifications
            const emailData = await this.getHealthCheckupEmailData(orderDetail, patient);
            // not awaited: a slow SMTP server must not hold up the reschedule API response
            emailHelperSMTP(orderDetail.patientId, patient.email, ...Object.values(EmailTemplates.healthCheckupRescheduled({
                ...emailData,
                previousDate: orderDetailPrev.bookingDate,
                previousTime: orderDetailPrev.bookingTime,
            }))).catch((err) => console.error('Health check-up rescheduled email failed:', err));
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Health Check-up Rescheduled",
                "description": `Your health check-up appointment (Booking ID ${requestId}) has been rescheduled from ${orderDetailPrev.bookingDate} at ${orderDetailPrev.bookingTime} to ${orderDetail.bookingDate} at ${orderDetail.bookingTime}.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            Promise.resolve(NotificationService.createNotification(patientNotifyData))
                .catch((err) => console.error('Patient notification failed:', err));
            this.notifyCareNavigators(patient, emailData, 'rescheduled', { previousDate: orderDetailPrev.bookingDate, previousTime: orderDetailPrev.bookingTime })
                .catch((err) => console.error('Care navigator notification failed:', err));
        }
        return result;
    }

    static async updateCart(cartId, updateData, patientId) {
        // only the patient's own cart
        const result = await Cart.update(updateData, {
            where: { id: cartId, patientId }
        });
        return result;
    }

    static async removeCart(cartId, patientId) {
        // only the patient's own cart
        const cart = await this.getOwnedCart(cartId, patientId);
        if (!cart) {
            return false;
        }
        const cartQuery = `
            DELETE FROM cartDetails
            WHERE cartId = :cartId;
        `;
        const query = `
            DELETE FROM cart
            WHERE id = :cartId AND patientId = :patientId;
        `;

        await sequelizeDB1.query(cartQuery, {
            replacements: { cartId: cart.id },
            type: QueryTypes.DELETE
        });

        await sequelizeDB1.query(query, {
            replacements: { cartId: cart.id, patientId },
            type: QueryTypes.DELETE
        });

        return true;
    }

    static async getLabOrdersByPatient(patientId) {
        let cartId='';
        let cartCount=0;
        try {
            const query = `
                SELECT DISTINCT
                    lo.id AS labOrderId,
                    lo.uniqueBookingId,
                    lo.labId,
                    l.labName,
                    l.description AS labDescription,
                    lod.type,
                    lod.mode,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL,
                    lo.labType,
                    lo.approved_by AS approvedBy
                FROM
                    labOrders lo
                JOIN
                    labOrderDetails lod ON lo.id = lod.labOrderId
                LEFT JOIN
                    labs l ON lo.labId = l.id
                WHERE
                    lo.patientId = :patientId
                    AND lo.isActive = true
                    AND lo.isDeleted = false
                    AND lod.isActive = true
                    AND lod.isDeleted = false
                ORDER BY 
                    lo.id DESC
            `;
          
            const results = await sequelizeDB1.query(query, {
                replacements: { patientId },
                type: QueryTypes.SELECT
            });
    
            cartCount = await CartDetails.count({
                where: {
                    patientId: patientId,
                    isActive: true
                }
            });
            if(cartCount != 0){
                const cart = await CartDetails.findOne({
                    where: {
                        patientId: patientId,
                        isActive: true
                    }
                });
                cartId = cart.cartId;
            }
            const data = {
                "labTestList" :  results,
                "cartId" :  cartId,
                "cartCount" : cartCount
            }
            return data;
        } catch (error) {
            throw new Error(`Error fetching lab orders: ${error.message}`);
        }
    };

    static async getLabOrdersForCareNavigator(status, search, filter,careCompanyIds) {
        try {
            let query = `
                SELECT
                    lo.id AS labOrderId,
                    p.id AS patientId,
                    lo.uniqueBookingId,
                    lo.labId,
                    CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                    l.labName,
                    l.description AS labDescription,
                    GROUP_CONCAT(DISTINCT lod.type) AS types, -- Concatenate types for each labOrderId
                    GROUP_CONCAT(DISTINCT lod.mode) AS modes, -- Concatenate modes for each labOrderId
                    lo.labCityName,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL,
                    COALESCE(MAX(c.is_sub_city), 0) AS is_sub_city
                FROM
                    labOrders lo
                JOIN
                    labOrderDetails lod ON lo.id = lod.labOrderId
                LEFT JOIN
                    labs l ON lo.labId = l.id
                JOIN
                    patient p ON lo.patientId = p.id
                LEFT JOIN
                    worksman_company_list c ON c.id = p.companyId
                WHERE `;
                if(status == 'pending'){ 
                    query += ` ( lo.orderStatus = :status OR lo.orderStatus = 'Payment Completed' ) `;
                }else if(status == 'confirmed'){ 
                    query += ` ( lo.orderStatus = :status OR lo.orderStatus = 'Reschedule' ) `;
                }else{
                    query += ` lo.orderStatus = :status `;
                }                    
            query += `  AND lo.isPaid = 1
                    AND lo.isActive = true
                    AND lo.isDeleted = false
                    AND lod.isActive = true
                    AND lod.isDeleted = false
                    AND (p.companyId IN (:careCompanyIds) OR p.employer_id IN (:careCompanyIds))
            `;
           
            // Add filtering based on the selected time range
            switch (filter) {
                case '1': // Last month
                    query += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                    break;
                case '2': // Last 6 months
                    query += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                    break;
                case '3': // Last 1 year
                    query += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                    break;
                default:
                    break;
            }

            // Add search conditions if provided
            if (search) {
                query += ` AND (
                    l.labName LIKE :search OR
                    lo.labCityName LIKE :search OR
                    CONCAT(p.first_name, ' ', p.last_name) LIKE :search
                )`
            }

            query +=  ` GROUP BY
                        lo.id,
                        p.id,
                        lo.uniqueBookingId,
                        lo.labId,
                        p.first_name,
                        p.last_name,
                        l.labName,
                        l.description,
                        lo.labCityName,
                        lo.bookingDate,
                        lo.bookingTime,
                        lo.orderStatus,
                        lo.labReportURL
                        ORDER BY lo.id desc
            `;

            const replacements = {
                status,
                careCompanyIds: toCompanyIdList(careCompanyIds),
            };
    
            if (search) {
                replacements.search = `%${search}%`;
            }   
          //  console.log(query);
            const results = await sequelizeDB1.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });
    
            return results;
        } catch (error) {
            throw new Error(`Error fetching lab orders: ${error.message}`);
        }
    };

    // conditions shared by the hr lab test list and the hr status graph, so both always count the same orders:
    // a single company, paid and active orders, the time range filter and the search box
    static buildHrLabOrderConditions(search, filter, companyId) {
        let where = ` lo.isPaid = 1
                    AND lo.isActive = true
                    AND lo.isDeleted = false
                    AND lod.isActive = true
                    AND lod.isDeleted = false
                    AND (p.companyId = :companyId OR p.employer_id = :companyId)
            `;
        switch (filter) {
            case '1': // Last month
                where += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                break;
            case '2': // Last 6 months
                where += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                break;
            case '3': // Last 1 year
                where += ` AND lo.bookingDate >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                break;
            default:
                break;
        }
        const replacements = { companyId };
        if (search) {
            where += ` AND (
                    l.labName LIKE :search OR
                    lo.labCityName LIKE :search OR
                    CONCAT(p.first_name, ' ', p.last_name) LIKE :search
                )`;
            replacements.search = `%${search}%`;
        }
        return { where, replacements };
    }

    // hr portal lab tests, always limited to a single company (resolved by the controller from the hr row)
    static async getLabOrdersForHr(status, search, filter, companyId) {
        try {
            const tab = HR_LAB_STATUS_TABS.find(item => item.status === status);
            const statusSql = tab
                ? `lo.orderStatus IN (:orderStatuses)`
                : `lo.orderStatus = :status`;
            const { where, replacements } = this.buildHrLabOrderConditions(search, filter, companyId);
            const query = `
                SELECT
                    lo.id AS labOrderId,
                    p.id AS patientId,
                    lo.uniqueBookingId,
                    lo.labId,
                    CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                    l.labName,
                    l.description AS labDescription,
                    GROUP_CONCAT(DISTINCT lod.type) AS types,
                    GROUP_CONCAT(DISTINCT lod.mode) AS modes,
                    lo.labCityName,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL,
                    COALESCE(MAX(c.is_sub_city), 0) AS is_sub_city
                FROM
                    labOrders lo
                JOIN
                    labOrderDetails lod ON lo.id = lod.labOrderId
                LEFT JOIN
                    labs l ON lo.labId = l.id
                JOIN
                    patient p ON lo.patientId = p.id
                LEFT JOIN
                    worksman_company_list c ON c.id = p.companyId
                WHERE ${statusSql} AND ${where}
                GROUP BY
                    lo.id,
                    p.id,
                    lo.uniqueBookingId,
                    lo.labId,
                    p.first_name,
                    p.last_name,
                    l.labName,
                    l.description,
                    lo.labCityName,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL
                ORDER BY lo.id desc
            `;
            if (tab) {
                replacements.orderStatuses = tab.orderStatuses;
            } else {
                replacements.status = status;
            }
            return await sequelizeDB1.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });
        } catch (error) {
            throw new Error(`Error fetching lab orders: ${error.message}`);
        }
    };

    // "lab bookings by status" graph for the hr portal, one entry per list tab with the same filter and search
    static async getLabOrderStatusSummaryForHr(search, filter, companyId) {
        try {
            const { where, replacements } = this.buildHrLabOrderConditions(search, filter, companyId);
            const rows = await sequelizeDB1.query(`
                SELECT orders.orderStatus, COUNT(*) AS count
                FROM (
                    SELECT lo.id, lo.orderStatus
                    FROM labOrders lo
                    JOIN labOrderDetails lod ON lo.id = lod.labOrderId
                    LEFT JOIN labs l ON lo.labId = l.id
                    JOIN patient p ON lo.patientId = p.id
                    WHERE ${where}
                    GROUP BY lo.id, lo.orderStatus
                ) orders
                GROUP BY orders.orderStatus
            `, { replacements, type: QueryTypes.SELECT });

            const countByStatus = {};
            rows.forEach(row => { countByStatus[row.orderStatus] = Number(row.count) || 0; });

            const statusWise = HR_LAB_STATUS_TABS.map(tab => ({
                key: tab.key,
                label: tab.label,
                status: tab.status,
                color: tab.color,
                count: tab.orderStatuses.reduce((sum, orderStatus) => sum + (countByStatus[orderStatus] || 0), 0),
            }));
            const totalBookings = statusWise.reduce((sum, item) => sum + item.count, 0);
            const percentOf = (count) => totalBookings ? Math.round((count / totalBookings) * 1000) / 10 : 0;
            statusWise.forEach(item => { item.percentage = percentOf(item.count); });

            const countOf = (key) => statusWise.find(item => item.key === key).count;
            return {
                period: HR_LAB_FILTER_LABELS[filter] || HR_LAB_FILTER_LABELS.all,
                totalBookings,
                // a booking is complete once its report is received
                completionPercentage: Math.round(percentOf(countOf('reportReceived'))),
                cancelledPercentage: Math.round(percentOf(countOf('cancelled'))),
                statusWise,
            };
        } catch (error) {
            throw new Error(`Error fetching lab order summary: ${error.message}`);
        }
    };

    static async getLabOrdersForDashboard(careCompanyIds) {
        try {
            const query = `
                SELECT DISTINCT
                    lo.id AS labOrderId,
                    lo.uniqueBookingId,
                    lo.labId,
                    CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                    l.labName,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labs l ON lo.labId = l.id
                JOIN 
                    patient p ON lo.patientId = p.id
                WHERE 
                    lo.orderStatus = "pending"
                    AND lo.isActive = true
                    AND lo.isDeleted = false
                    AND p.employer_id IN (:careCompanyIds)
                ORDER BY 
                    lo.bookingDate DESC
                LIMIT 5
            `;
          
            const results = await sequelizeDB1.query(query, {
                replacements: { careCompanyIds: toCompanyIdList(careCompanyIds) },
                type: QueryTypes.SELECT
            });
    
            return results;
        } catch (error) {
            throw new Error(`Error fetching lab orders: ${error.message}`);
        }
    };


    static async getLabTestsListByPatient(patientId) {
        try {
            const query = `
                SELECT DISTINCT
                    lo.id AS labOrderId,
                    lo.id AS uniqueBookingId,
                    lo.labId,
                    l.labName,
                    l.description AS labDescription,
                    lod.type,
                    lod.mode,
                    lo.bookingDate,
                    lo.bookingTime,
                    lo.orderStatus,
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labOrderDetails lod ON lo.id = lod.labOrderId
                JOIN 
                    labs l ON lo.labId = l.id
                WHERE 
                    lo.patientId = :patientId
                    AND lo.isActive = true
                    AND lo.isDeleted = false
                    AND lod.isActive = true
                    AND lod.isDeleted = false
                    AND lo.orderStatus IN ('Completed', 'Result Awaited', 'Report Generated');
            `;
          
            const results = await sequelizeDB1.query(query, {
                replacements: { patientId },
                type: QueryTypes.SELECT
            });
          
            return results;
        } catch (error) {
            throw new Error(`Error fetching lab tests list: ${error.message}`);
        }
    };

    static async purchaseLabTest(orderId, updateData, totalPrice, patientId, cartId) {
        if (totalPrice <= 0) {
            throw new Error('Total price must be greater than zero!');
        }
        // Update the LabOrder record
        await LabOrder.update(updateData, {
            where: { id: orderId },
        });

        // Generate the payment link
        const paymentLink = await this.generatePaymentLink(orderId, totalPrice, patientId, cartId);
        return paymentLink;
    }

    static async purchaseLabTestMobile(orderId, updateData, totalPrice, patientId, cartId) {
        if (totalPrice <= 0) {
            throw new Error('Total price must be greater than zero!');
        }
        // Update the LabOrder record
        await LabOrder.update(updateData, {
            where: { id: orderId },
        });

        // Generate the payment link
        const paymentLink = await this.generatePaymentLinkMobile(orderId, totalPrice, patientId, cartId);
        return paymentLink;
    }
    
    // static async generatePaymentLink(orderId, totalPrice, patientId, cartId) {
    //     try {
    //         const payload = {
    //             key: PAYU_MONEY_KEY,
    //             orderId: orderId,
    //             amount: totalPrice,
    //             orderInfo: 'Lab Test Payment',
    //             patientId: patientId, // Replace with actual user data
    //             cartId: cartId, // Replace with actual user data
    //             hash: this.generateHash(orderId, cartId, totalPrice, patientId),
    //             returnUrl: DEV_PAYU_SUCCESS_URL,
    //             cancelURL: DEV_PAYU_CANCEL_URL,
    //             failedURL: DEV_PAYU_FAILED_URL,
    //         };

    //         const response = await axios.post(PAYU_MONEY_API_URL, payload);

    //         if (response.status === 200 && response.data) {
    //             return response.data;
    //         } else {
    //             throw new Error('Failed to generate payment link');
    //         }
    //     } catch (error) {
    //         logError(
    //             orderId,
    //             error.response,
    //             'labTestService.js',
    //             'labTestPayment',
    //             '1434',
    //             JSON.stringify(error)
    //         );
    //         console.error('Error generating payment link:', error);
    //         throw new Error('Error generating payment link');
    //     }
    // }

    // static generateHash(orderId, cartId, totalPrice, patientId) {
    //     const hashString = `${PAYU_MONEY_KEY}|${orderId}|${cartId}|${patientId}|${totalPrice}|${PAYU_MONEY_SALT}`;
    //     const crypto = require('crypto');
    //     return crypto.createHash('sha512').update(hashString).digest('hex');
    // }

    static async generatePaymentLink(orderId, totalPrice, patientId, cartId) {
        try {        
            const razorpayInstance = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID, // Your Razorpay key ID
                key_secret: process.env.RAZORPAY_SECRET, // Your Razorpay secret
            });

            const amountInPaise = Math.round(Number(totalPrice) * 100);

            const orderOptions = {
                amount: amountInPaise, // Amount in paise
                currency: 'INR',
                receipt: `receipt_${orderId}`,
                notes: {
                    patientId: patientId,
                    cartId: cartId,
                    orderId: orderId,
                    orderInfo: 'Lab Test Payment',
                },
                payment_capture: 1, // Auto-captures the payment
            };

            // Create order in Razorpay
            const order = await razorpayInstance.orders.create(orderOptions);
            console.log(order,'order====');

            const patientDetails = await Patient.findOne({where: {id : patientId}});
         
            if (order && order.id && patientDetails) {
                let updateData;
                // order id save 
                // updateData = {
                //     "razorpay_order_id": order.id                   
                // };                
                // await LabOrder.update(updateData, {
                //     where: { id: order.notes.orderId },
                // });
                await this.updateOrderRazopay(order.id,order.notes.orderId);
               // console.log(updateData,order.notes.orderId,"jdjdj");
                // Return the Razorpay order details
                const returnData = {
                    key: process.env.RAZORPAY_KEY_ID, // Razorpay key_id received from the server
                    amount: order.amount, // Amount in currency subunits
                    currency: order.currency,
                    name: process.env.COMPANY_NAME, // Your business name
                    description: 'Lab Test Payment',
                    image: PATIENT_BACKEND_URL+"/assets/akosLogo.png",
                    order_id: order.id, // Order ID returned by the server
                    callback_url: PATIENT_BACKEND_URL+'/api/labs/paymentStatus',
                    prefill: {
                      name: patientDetails.first_name+' '+patientDetails.last_name, // Optional prefilled customer details
                      email: patientDetails.email,
                      contact: patientDetails.phone,
                    },
                    notes: {
                        address: patientDetails.city+', '+patientDetails.state,
                        patientId: order.notes.patientId,
                        cartId: order.notes.cartId,
                        orderId: order.notes.orderId,
                        orderInfo: order.notes.orderInfo,
                        receipt: order.receipt
                    },
                    status: order.status,
                    theme: {
                      color: '#3399cc',
                    },
                };
                return returnData;
            } else {
                throw new Error('Failed to generate Razorpay payment link');
            }
        } catch (error) {
            // Log error for debugging and throw it
            logError(
                orderId,
                error.response,
                'paymentService.js',
                'generatePaymentLink',
                '1434',
                JSON.stringify(error)
            );
            console.error('Error generating Razorpay payment link:', error);
            throw new Error('Error generating payment link');
        }
    }

    static async generatePaymentLinkMobile(orderId, totalPrice, patientId, cartId) {
        try {        
            const razorpayInstance = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID, // Your Razorpay key ID
                key_secret: process.env.RAZORPAY_SECRET, // Your Razorpay secret
            });

            const amountInPaise = Math.round(Number(totalPrice) * 100);

            const orderOptions = {
                amount: amountInPaise, // Amount in paise
                currency: 'INR',
                receipt: `receipt_${orderId}`,
                notes: {
                    patientId: patientId,
                    cartId: cartId,
                    orderId: orderId,
                    orderInfo: 'Lab Test Payment',
                },
                payment_capture: 1, // Auto-captures the payment
            };

            // Create order in Razorpay
            const order = await razorpayInstance.orders.create(orderOptions);
            console.log(order,'order====');

            const patientDetails = await Patient.findOne({where: {id : patientId}});
         
            if (order && order.id && patientDetails) {
                // order id save                
                await this.updateOrderRazopay(order.id,order.notes.orderId);
                // Return the Razorpay order details
                const returnData = {
                    key: process.env.RAZORPAY_KEY_ID, // Razorpay key_id received from the server
                    amount: order.amount, // Amount in currency subunits
                    currency: order.currency,
                    name: process.env.COMPANY_NAME, // Your business name
                    description: 'Lab Test Payment',
                    image: PATIENT_BACKEND_URL+"/assets/akosLogo.png",
                    order_id: order.id, // Order ID returned by the server
                    callback_url: PATIENT_BACKEND_URL+'/api/labs/paymentStatusMobile',
                    prefill: {
                      name: patientDetails.first_name+' '+patientDetails.last_name, // Optional prefilled customer details
                      email: patientDetails.email,
                      contact: patientDetails.phone,
                    },
                    notes: {
                        address: patientDetails.city+', '+patientDetails.state,
                        patientId: order.notes.patientId,
                        cartId: order.notes.cartId,
                        orderId: order.notes.orderId,
                        orderInfo: order.notes.orderInfo,
                        receipt: order.receipt
                    },
                    status: order.status,
                    theme: {
                      color: '#3399cc',
                    },
                };
                return returnData;
            } else {
                throw new Error('Failed to generate Razorpay payment link');
            }
        } catch (error) {
            // Log error for debugging and throw it
            logError(
                orderId,
                error.response,
                'paymentService.js',
                'generatePaymentLink',
                '1434',
                JSON.stringify(error)
            );
            console.error('Error generating Razorpay payment link:', error);
            throw new Error('Error generating payment link');
        }
    }

    static async getPrescriptionUploaded(careCompanyIds) {
        const query = `
            SELECT 
                ltp.id, 
                ltp.prescriptionFile, 
                p.first_name AS patientName, 
                p.phone, 
                ltp.notes, 
                DATE(ltp.createdAt) AS createdAt
            FROM 
                labTestPrescription ltp
            JOIN 
                patient p ON ltp.patientId = p.id
            WHERE 
                ltp.isActive = true 
                AND ltp.isDeleted = false
                AND p.employer_id IN (:careCompanyIds)
            ORDER BY 
                ltp.createdAt DESC;
        `;
    
        const prescriptions = await sequelizeDB1.query(query, {
            replacements: { careCompanyIds: toCompanyIdList(careCompanyIds) },
            type: QueryTypes.SELECT,
        });
    
        // if (!prescriptions || prescriptions.length === 0) {
        //     throw new Error('Prescriptions not found');
        // }
    
        return prescriptions;
    }
    //
    static async getOrderDetailsByRazorpayOrder(orderId) {
        const orderDetail = await LabOrder.findOne({
            where: { razorpay_order_id: orderId }
        });
      // const { id } = orderDetail;      
        return orderDetail;
    }

    static async updateOrderRazopay(razorpayId,orderId) {
        const orderLabQuesry = `
           update labOrders set razorpay_order_id = :razorpayId
            WHERE id = :orderId;
        `;     

        await sequelizeDB1.query(orderLabQuesry, {
            replacements: { razorpayId,orderId },
            type: QueryTypes.UPDATE
        });
        return true;
    }

    static async getRedcliffAloc(areaString){
        const payload = {
            headers: {  
              'Accept': 'application/json',          
              'key': REDCLIFF_KEY,
              'Cookie': REDCLIFF_COOKIE
            }
          };
       // console.log(REDCLIFF_LAB_URL);
       // const alocData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query=mewat hariyana", payload);
        //console.log(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query="+city+" "+state);
        const alocData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query="+encodeURIComponent(String(areaString ?? "")), payload);
        return alocData.data;
    }

    static async getRedcliffLatLong(aloc){
         const payload = {
            headers: {  
              'Accept': 'application/json',          
              'key': REDCLIFF_KEY,
              'Cookie': REDCLIFF_COOKIE
            }
          };
       // console.log(REDCLIFF_LAB_URL);
       // const alocData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query=mewat hariyana", payload);
        const latLongData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-loc-2-eloc/?eloc="+encodeURIComponent(String(aloc ?? "")), payload);        
        return latLongData;
    }

    // get collction slot
    static async getRedcliffCollectionSlot(collection_date,lat,long){
         const payload = {
            headers: {  
              'Accept': 'application/json',          
              'key': REDCLIFF_KEY,
              'Cookie': REDCLIFF_COOKIE
            }
          };
       // console.log(REDCLIFF_LAB_URL);
       // const alocData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query=mewat hariyana", payload);
        const query = new URLSearchParams({ collection_date: String(collection_date ?? ""), latitude: String(lat ?? ""), longitude: String(long ?? "") });
        const collectionSlot = await axios.get(REDCLIFF_LAB_URL+"api/booking/v2/get-time-slot-list/?"+query.toString(), payload); 
        return collectionSlot;
    }
    // create booking in redcliff
    // pId: logged in patient, the order has to be theirs
    static async createBookingRedcliff(orderId,pId){

        //  const data = {           
        //         "booking_date": "2025-05-25",
        //         "collection_date" : "2025-05-27",
        //         "collection_slot" : 46,
        //         "customer_address" : "House/Flat/Floor No:10,Road/Apt./Area:11",
        //         "customer_age" : "10",
        //         "customer_altphonenumber":"9602942446",
        //         "email" : "customer.reports@redcliffelabs.com",
        //         "customer_gender" : "male",
        //         "customer_latitude" : 28.6111,
        //         "customer_longitude" : 77.3689,
        //         "customer_name" : "Sachin Sharma",
        //         "customer_phonenumber":"9602942446",
        //         "customer_whatsapppnumber" : "9602942446",
        //         "is_credit" : true,
        //         "landmark" : "PMO Apartment, Block C, Sector 62, Noida, Uttar Pradesh, 201309",
        //         "package_code" : ["CAMP015"],
        //         "pincode" : "201309",
        //         "additional_member": []            
        //     };
        //     console.log(data);
        //     const response = await axios.post(REDCLIFF_LAB_URL+"api/external/v2/center-create-booking/", data, {
        //         headers: {
        //             'Content-Type': 'application/json',
        //             'key': REDCLIFF_KEY,
        //             'Cookie': REDCLIFF_COOKIE
        //         },
        //     });
        //     console.log(response,'response================');
        //     return response;

        //let orderId = orId;
          const query = `
                SELECT DISTINCT
                    lo.*,
                    l.labName,
                    l.description AS labDescription,
                    lod.type,
                    lod.mode,                   
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labOrderDetails lod ON lo.id = lod.labOrderId
                JOIN 
                    labs l ON lo.labId = l.id
                WHERE 
                    lo.id = :orderId AND 
                    lo.patientId = :pId AND
                    lo.labType = 'Redcliff' AND
                    lo.paymentStatus = 'paid'
                    ;
            `;          
            const results = await sequelizeDB1.query(query, {
                replacements: { orderId, pId },
                type: QueryTypes.SELECT
            });          
           // console.log(rs.bookingDate);           
            if(results.length> 0){
                const rs = results[0];
                // already booked with redcliff, never book the same order twice
                if (rs.booking_id) {
                    return true;
                }
                const patientId =  rs.patientId;   
                // get customer details                
                const queryPatient = `
                SELECT DISTINCT
                    p.first_name,p.last_name,p.email,p.gender,p.phone,pd.age                 
                FROM 
                    patient p
                JOIN
                    patientDetails pd
                ON 
                    p.id = pd.patientId                
                WHERE 
                    p.id = :patientId;`;          
                const resultsPatient = await sequelizeDB1.query(queryPatient, {
                    replacements: { patientId },
                    type: QueryTypes.SELECT
                });
                const patientInfo = resultsPatient[0];
                // get patient address
                const queryPatientadd = `
                SELECT DISTINCT
                    pa.*                 
                FROM 
                    labTestBookingAddress pa                         
                WHERE 
                    pa.patientId = :patientId  ORDER BY pa.id desc;`;          
                const resultsPatientadd = await sequelizeDB1.query(queryPatientadd, {
                    replacements: { patientId },
                    type: QueryTypes.SELECT
                });
                const patientAddressInfo = resultsPatientadd[0];
                // code details

                const codeQ = `
                    SELECT DISTINCT
                       lod.code
                    FROM 
                       labOrderDetails lod                    
                    WHERE 
                        lod.labOrderId = :orderId;`;  
                const codeRs = await sequelizeDB1.query(codeQ, {
                    replacements: { orderId },
                    type: QueryTypes.SELECT
                }); 
                console.log(codeRs);
                // Create a Date object
                const date = new Date(rs.createdAt);
                // Format the date to YYYY-MM-DD
                const formattedDate = date.toISOString().split('T')[0];              
                 const data = {           
                    booking_date: formattedDate,
                    collection_date : rs.bookingDate,
                    collection_slot : rs.slotId,
                    customer_address : patientAddressInfo.address,
                    customer_age : patientInfo.age,
                    customer_altphonenumber:patientInfo.phone,
                    email : patientInfo.email,
                    customer_gender : patientInfo.gender,
                    customer_latitude : 28.6111,
                    customer_longitude : 77.3689,
                    customer_name : patientInfo.first_name+" "+patientInfo.last_name,
                    customer_phonenumber:patientInfo.phone,
                    customer_whatsapppnumber : patientInfo.phone,
                    is_credit : true,
                    landmark : patientAddressInfo.address+" "+patientAddressInfo.city+" "+patientAddressInfo.state+" "+patientAddressInfo.zip_code,
                    package_code : ["CAMP015"],
                    pincode : patientAddressInfo.zip_code,
                    additional_member: []            
                };               
                const response11 = await axios.post(REDCLIFF_LAB_URL+"api/external/v2/center-create-booking/", data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'key': REDCLIFF_KEY,
                        'Cookie': REDCLIFF_COOKIE
                    },
                });
                const response = response11.data;  
                console.log(response);          
                if(response.status == 'success'){
                    console.log("true");                   
                    const booking_id = response.booking_id;
                    const booking_date = response.booking_date;
                    const collection_date = response.collection_date;
                    console.log(booking_id,"booking id ====");
                    // update order table by lab booing id 
                    const orderLabQuesry = `
                    update labOrders set booking_id = :booking_id
                        WHERE id = :orderId;
                    `; 
                    await sequelizeDB1.query(orderLabQuesry, {
                        replacements: { booking_id,orderId },
                        type: QueryTypes.UPDATE
                    });
                    
                    setTimeout(() => {
                       const confirResponse = this.confirmredcliffbooking(booking_id);
                       return confirResponse;
                    }, 3000);

                }else{
                    return response;
                }                

            }else{
                return true;
            }  
    } 
    // call confirm booking from redcliff
    static async confirmredcliffbooking(booking_id){
        const data = {
            "booking_id": booking_id,
            "is_confirmed" : true
        }
        const response = await axios.post(REDCLIFF_LAB_URL+"api/external/v2/center-confirm-booking/", data, {
                headers: {
                    'Content-Type': 'application/json',
                    'key': REDCLIFF_KEY,
                    'Cookie': REDCLIFF_COOKIE
                },
            });
            return response; 
    }   

    // get report from redcliff 
    static async redcliffLabTestReport(){

    }
    // book the redicliff lab test

    static async updateThirdPartyLab(orderId1, updateData, response11){
        // get order details
        let orderId = 438;
          const query = `
                SELECT DISTINCT
                    lo.*,
                    l.labName,
                    l.description AS labDescription,
                    lod.type,
                    lod.mode,                   
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labOrderDetails lod ON lo.id = lod.labOrderId
                JOIN 
                    labs l ON lo.labId = l.id
                WHERE 
                    lo.id = :orderId AND 
                    lo.labType = 'Redcliff' AND
                    lo.paymentStatus = 'paid'
                    ;
            `;          
            const results = await sequelizeDB1.query(query, {
                replacements: { orderId },
                type: QueryTypes.SELECT
            });          
           // console.log(rs.bookingDate);           
            if(results.length> 0){
                const rs = results[0];
                const patientId =  rs.patientId;   
                // get customer details                
                const queryPatient = `
                SELECT DISTINCT
                    p.first_name,p.last_name,p.email,p.gender,p.phone,pd.age                 
                FROM 
                    patient p
                JOIN
                    patientDetails pd
                ON 
                    p.id = pd.patientId                
                WHERE 
                    p.id = :patientId;`;          
                const resultsPatient = await sequelizeDB1.query(queryPatient, {
                    replacements: { patientId },
                    type: QueryTypes.SELECT
                });
                const patientInfo = resultsPatient[0];
                // get patient address
                const queryPatientadd = `
                SELECT DISTINCT
                    pa.*                 
                FROM 
                    labTestBookingAddress pa                         
                WHERE 
                    pa.patientId = :patientId  ORDER BY pa.id desc;`;
          
                const resultsPatientadd = await sequelizeDB1.query(queryPatientadd, {
                    replacements: { patientId },
                    type: QueryTypes.SELECT
                });
                const patientAddressInfo = resultsPatientadd[0];
                // Create a Date object
                const date = new Date(rs.createdAt);
                // Format the date to YYYY-MM-DD
                const formattedDate = date.toISOString().split('T')[0];              
                 const data = {           
                    "booking_date": formattedDate,
                    "collection_date" : rs.bookingDate,
                    "collection_slot" : rs.slotId,
                    "customer_address" : patientAddressInfo.address,
                    "customer_age" : patientInfo.age,
                    "customer_altphonenumber":patientInfo.phone,
                    "email" : patientInfo.email,
                    "customer_gender" : patientInfo.gender,
                    "customer_latitude" : 28.6111,
                    "customer_longitude" : 77.3689,
                    "customer_name" : patientInfo.first_name+" "+patientInfo.last_name,
                    "customer_phonenumber":patientInfo.phone,
                    "customer_whatsapppnumber" : patientInfo.phone,
                    "is_credit" : true,
                    "landmark" : patientAddressInfo.address+" "+patientAddressInfo.city+" "+patientAddressInfo.state+""+patientAddressInfo.zip_code,
                    "package_code" : ["CAMP015"],
                    "pincode" : patientAddressInfo.zip_code,
                    "additional_member": []            
                };
                console.log(data);
                  const response = await axios.post(REDCLIFF_LAB_URL+"api/external/v2/center-create-booking/", data, {
                        headers: {
                            'Content-Type': 'application/json',
                            'key': REDCLIFF_KEY,
                           'Cookie': REDCLIFF_COOKIE
                        },
                    });
                    console.log(response,'response================');
                    return response;

            }
       
    }
    // get order details
    static async checkRedclifforder(orderId){
        const query = `
                SELECT DISTINCT
                    lo.labType,lo.code,
                FROM 
                    labOrders lo               
                WHERE 
                    lo.paymentStatus = 'paid' AND lo.labType = 'Redcliff' AND lo.id = :orderId;`;          
            const results = await sequelizeDB1.query(query, {
                replacements: { orderId },
                type: QueryTypes.SELECT
            });
            let isRedCliff = 0;

           if(results.length> 0){
                 const data = results[0];
                 if(data.labType == 'Redcliff'){
                    isRedCliff = 1;
                 }     
            }
           return isRedCliff;
           // console.log(rs.bookingDate);  
    }

    // purchase call 
        static async purchaseCall(orderId, updateData, totalPrice, patientId, cartId) {
        if (totalPrice <= 0) {
            throw new Error('Total price must be greater than zero!');
        }
        // Update the LabOrder record
        await LabOrder.update(updateData, {
            where: { id: orderId },
        });

        // Generate the payment link
        const paymentLink = await this.generatePaymentLink(orderId, totalPrice, patientId, cartId);
        return paymentLink;
    }
    
    static async generatePaymentLinkForCall(orderId, patientId, company_id, call_type, totalPrice) {
        try {        
            const razorpayInstance = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID, // Your Razorpay key ID
                key_secret: process.env.RAZORPAY_SECRET, // Your Razorpay secret
            });

            const amountInPaise = Math.round(Number(totalPrice) * 100);

            const randomSixDigit = Math.floor(10000000 + Math.random() * 900000);

            const orderOptions = {
                amount: amountInPaise, // Amount in paise
                currency: 'INR',
                receipt: `receipt_${orderId}`,
                notes: {
                    patientId: patientId,                  
                    orderInfo: 'Call avail Payment',
                    orderId:orderId
                },
                payment_capture: 1, // Auto-captures the payment
            };

            // Create order in Razorpay
            const order = await razorpayInstance.orders.create(orderOptions);
            console.log(order,'order====');

            const patientDetails = await Patient.findOne({where: {id : patientId}});
         
            if (order && order.id && patientDetails) {
                let updateData;
                // order id save 
                // updateData = {
                //     "razorpay_order_id": order.id                   
                // };                
                // await LabOrder.update(updateData, {
                //     where: { id: order.notes.orderId },
                // });
                await this.updatePaymentCallRazopay(order.id,order.notes.orderId);
               // console.log(updateData,order.notes.orderId,"jdjdj");
                // Return the Razorpay order details
                const returnData = {
                    key: process.env.RAZORPAY_KEY_ID, // Razorpay key_id received from the server
                    amount: order.amount, // Amount in currency subunits
                    currency: order.currency,
                    name: process.env.COMPANY_NAME, // Your business name
                    description: 'Call avail Payment',
                    image: PATIENT_BACKEND_URL+"/assets/akosLogo.png",                    
                     order_id: order.id, 
                    callback_url: PATIENT_BACKEND_URL+'/api/labs/paymentStatusCallCheck',
                    prefill: {
                      name: patientDetails.first_name+' '+patientDetails.last_name, // Optional prefilled customer details
                      email: patientDetails.email,
                      contact: patientDetails.phone,
                    },
                    notes: {
                        address: patientDetails.city+', '+patientDetails.state,
                        patientId: order.notes.patientId,
                        orderInfo: order.notes.orderInfo,                   
                        orderId: order.notes.orderId,                      
                        receipt: order.receipt
                       
                    },
                    status: order.status,
                    theme: {
                      color: '#3399cc',
                    },
                };
                return returnData;
            } else {
                throw new Error('Failed to generate Razorpay payment link');
            }
        } catch (error) {
            // Log error for debugging and throw it
            logError(
                orderId,
                error.response,
                'paymentService.js',
                'generatePaymentLink',
                '1434',
                JSON.stringify(error)
            );
            console.error('Error generating Razorpay payment link:', error);
            throw new Error('Error generating payment link');
        }
    }
    // check patient for call 
    static async postPayemntPatientForCall(patient_id,company_id,call_type,total_price,call_date,call_time){
        total_price = Number(total_price);
        if (!Number.isFinite(total_price) || total_price <= 0) {
            throw httpError(400, 'Total price must be greater than zero!');
        }
        if (![1, 2].includes(Number(call_type))) {
            throw httpError(400, 'Invalid call type');
        }
        const insertQuery = `INSERT INTO 
                                payment_for_call
                            SET 
                                patient_id = :patient_id,
                                company_id = :company_id,
                                call_type = :call_type,
                                amounts = :total_price,
                                call_date =:call_date,
                                call_time = :call_time                           

                            `;

            const insertReplacements = {
                patient_id,
                company_id,
                call_type,
                total_price,
                call_date,
                call_time    
            };
           const [insertResult] = await sequelizeDB1.query(insertQuery, {
                type: QueryTypes.INSERT,
                replacements: insertReplacements
            });  
            const orderId = insertResult;
        // Generate the payment link
        const paymentLink = await this.generatePaymentLinkForCall(orderId, patient_id, company_id, call_type, total_price);
        return paymentLink;
    }

    static async updatePaymentCallRazopay(razorpayId,orderId) {
        const orderLabQuesry = `
           update payment_for_call set razorpay_order_id = :razorpayId
            WHERE id = :orderId;
        `;     

        await sequelizeDB1.query(orderLabQuesry, {
            replacements: { razorpayId,orderId },
            type: QueryTypes.UPDATE
        });
        return true;
    }
    // payment status update
    // the call payment row of the patient, null when it is not theirs
    static async getOwnedCallPayment(orderId, patientId) {
        const [row] = await sequelizeDB1.query(
            'SELECT id, patient_id, razorpay_order_id, payment_status FROM payment_for_call WHERE id = :orderId AND patient_id = :patientId LIMIT 1',
            { replacements: { orderId, patientId }, type: QueryTypes.SELECT }
        );
        return row || null;
    }

    static async updateCallForPaymentStatus(orderId, updateData, response){
        //  const result = await LabOrder.update(updateData, {
        //     where: { id: orderId }
        // });
        // const status = updateData.orderStatus;
        // const orderDetail = await LabOrder.findOne({
        //     where: { id: orderId }
        // });

         const orderCall = `
           SELECT * from payment_for_call WHERE id = :orderId;
        `; 
        const [orderDetail] = await sequelizeDB1.query(orderCall, {
            replacements: { orderId },
            type: QueryTypes.SELECT
        });
        console.log("orderId",orderId);

        const status = updateData.order_status;      
        const paymentStatus = updateData.payment_status; 
        const orderLabQuesry = `
           update payment_for_call set payment_status = :paymentStatus,order_status=:status
            WHERE id = :orderId;
        `; 
        const result = await sequelizeDB1.query(orderLabQuesry, {
            replacements: { paymentStatus,status,orderId },
            type: QueryTypes.UPDATE
        });


        // update payment status

        const patient = await Patient.findOne({ where: { id: orderDetail.patient_id } });
        if(status == "confirmed"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patient_id, patient.email, ...Object.values(EmailTemplates.bookingStatusPatient({ name: patientName, status: 'confirmed' })));      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been successfully confirmed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Confirmed",
                "description": `We are pleased to inform you that your lab test booking has been successfully confirmed.`,
                "referenceId": orderDetail.patient_id,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
        }
        if(status == "Cancelled"){  // Send Notifications failed  cancelled
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patient_id, patient.email, ...Object.values(EmailTemplates.bookingStatusPatient({ name: patientName, status: 'cancelled', bookingType: 'Call' })));      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been cancelled. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Call Booking Cancelled",
                "description": `We are pleased to inform you that your lab test booking has been cancelled.`,
                "referenceId": orderDetail.patient_id,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
        }
        if(status == "Completed"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patient_id, patient.email, ...Object.values(EmailTemplates.bookingStatusPatient({ name: patientName, status: 'completed', bookingType: 'Call' })));      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been Completed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Call Booking Completed",
                "description": `We are pleased to inform you that your lab test booking has been Completed.`,
                "referenceId": orderDetail.patient_id,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
        }
        if(status == "Report Generated"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patient_id, patient.email, ...Object.values(EmailTemplates.bookingStatusPatient({ name: patientName, status: 'reportGenerated', bookingType: 'Call' })));      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Call Booking Completed",
                "description": `We are pleased to inform you that your lab test booking Report has been Generated.`,
                "referenceId": orderDetail.patient_id,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
        }
        return result;
    }
    // coupon verified
    static async checkCouponCode(patient_id, coupon_code){
         if (!coupon_code || typeof coupon_code !== 'string' || coupon_code.length > 64 || !patient_id) {
            throw httpError(400, 'Please provide valid data!');
        }
        // limit guesses per patient
        const now = Date.now();
        const attempt = couponAttempts.get(patient_id);
        if (attempt && attempt.resetAt > now) {
            if (attempt.count >= COUPON_MAX_ATTEMPTS) {
                throw httpError(429, 'Too many coupon attempts, please try again later');
            }
            attempt.count += 1;
        } else {
            couponAttempts.set(patient_id, { count: 1, resetAt: now + COUPON_WINDOW_MS });
        }
        // claim the coupon in one statement so a coupon can be used only once, even with parallel requests
             const orderLabQuesry = `
           update patient_coupon set status = 2
             where
                patient_id = :patient_id
            AND
                coupon_code = :coupon_code
            AND
                status = 1
        `;

         const updateReplacements = {
                patient_id,
                coupon_code
            };

        const [, affectedRows] = await sequelizeDB1.query(orderLabQuesry, {
            replacements: updateReplacements,
            type: QueryTypes.UPDATE
        });
        const result = Number(affectedRows) > 0;
        if (result) {
            couponAttempts.delete(patient_id);
        }


            const data = {};
            if(result){
                data.is_verified = 1; 
            }else{
                data.is_verified = 0; 
            }
            return data;
    }

    // fetch the patient's company with its feature flags (is_sub_city etc.)
    static async getPatientCompanyDetails(patientId){
        const query = `
            SELECT
                p.id AS patient_id,
                c.id AS company_id,
                c.parent_id,
                c.company_name,
                c.employer_id,
                c.active,
                c.has_portal,
                c.is_sub_city,
                c.is_pament_required,
                c.is_domain_check,
                c.domain_url,
                c.enable_email_notification,
                c.cobrand_support,
                c.api_access
            FROM patient p
            INNER JOIN worksman_company_list c ON c.id = p.companyId
            WHERE p.id = :patientId
            LIMIT 1;
        `;
        const [companyDetails] = await sequelizeDB1.query(query, {
            replacements: { patientId },
            type: QueryTypes.SELECT
        });
        return companyDetails || null;
    }

    // sub cities of a lab city (lab_sub_cities.city_id -> labcities.id)
    static async getSubCitiesByCityId(cityId){
        const query = `
            SELECT
                sc.id,
                sc.city_id,
                sc.sub_city_name
            FROM lab_sub_cities sc
            INNER JOIN labCities lc ON lc.id = sc.city_id AND lc.isActive = 1
            WHERE sc.city_id = :cityId
            ORDER BY sc.sub_city_name ASC;
        `;
        return sequelizeDB1.query(query, {
            replacements: { cityId },
            type: QueryTypes.SELECT
        });
    }

    // active labs of the patient's company that offer every package in the order and have
    // a branch in the given city (matched by city name, same as the patient booking flow),
    // with each package's price at that lab (total = price - discount, same as the patient cart)
    static async getLabsForOrderPackages(orderId, labCityId){
        const query = `
            SELECT
                l.id AS labId,
                l.labName,
                l.description AS labDescription,
                l.labAddress,
                lod.referenceId AS packageId,
                MAX(lod.name) AS packageName,
                MIN(cl.price) AS price,
                MIN(cl.price - COALESCE(cl.discount, 0)) AS totalPrice
            FROM labOrders lo
            JOIN patient p ON p.id = lo.patientId
            JOIN labOrderDetails lod ON lod.labOrderId = lo.id
                AND lod.type = 'Package'
                AND lod.isActive = 1
                AND lod.isDeleted = 0
            JOIN connectedLabs cl ON cl.referenceId = lod.referenceId
                AND cl.type = 'Package'
                AND cl.mode = lod.mode
                AND cl.companyId = p.companyId
                AND cl.isActive = 1
            JOIN labs l ON l.id = cl.labId AND l.isActive = 1
            WHERE lo.id = :orderId
            GROUP BY l.id, l.labName, l.description, l.labAddress, lod.referenceId
            ORDER BY l.labName ASC, packageName ASC;
        `;
        const branchQuery = `
            SELECT
                lb.id,
                lb.labId,
                lb.labCityId,
                lb.branchName,
                lb.branchAddress
            FROM labBranches lb
            JOIN labCities lc ON lc.id = lb.labCityId AND lc.isActive = 1
            WHERE lb.isActive = 1
                AND lc.cityName = (SELECT cityName FROM labCities WHERE id = :labCityId)
            ORDER BY lb.branchName ASC;
        `;
        const [rows, branches] = await Promise.all([
            sequelizeDB1.query(query, {
                replacements: { orderId },
                type: QueryTypes.SELECT
            }),
            labCityId ? sequelizeDB1.query(branchQuery, {
                replacements: { labCityId },
                type: QueryTypes.SELECT
            }) : []
        ]);

        const totalPackages = new Set(rows.map(row => row.packageId)).size;
        const labs = new Map();
        rows.forEach(row => {
            if (!labs.has(row.labId)) {
                labs.set(row.labId, {
                    labId: row.labId,
                    labName: row.labName,
                    labDescription: row.labDescription,
                    labAddress: row.labAddress,
                    price: 0,
                    discount: 0,
                    totalPrice: 0,
                    packages: [],
                    branches: branches.filter(branch => Number(branch.labId) === Number(row.labId))
                });
            }
            const lab = labs.get(row.labId);
            const price = Number(row.price) || 0;
            const totalPrice = Number(row.totalPrice) || 0;
            lab.packages.push({
                packageId: row.packageId,
                packageName: row.packageName,
                price,
                discount: price - totalPrice,
                totalPrice
            });
            lab.price += price;
            lab.discount += price - totalPrice;
            lab.totalPrice += totalPrice;
        });
        // only labs that offer every package in the order and have a branch in the city
        return [...labs.values()].filter(lab => lab.packages.length === totalPackages && lab.branches.length > 0);
    }

    // values for the health check-up request received / confirmed emails
    static async getHealthCheckupEmailData(order, patient){
        const [company, labRows] = await Promise.all([
            this.getPatientCompanyDetails(patient.id).catch(() => null),
            sequelizeDB1.query(`
                SELECT l.labName, lb.branchName, lb.branchAddress
                FROM labOrders lo
                LEFT JOIN labs l ON l.id = lo.labId
                LEFT JOIN labBranches lb ON lb.id = lo.labBranchId
                WHERE lo.id = :orderId
                LIMIT 1;`, {
                replacements: { orderId: order.id },
                type: QueryTypes.SELECT
            }).catch(() => [])
        ]);
        const lab = labRows[0] || {};

        // lab branch visit -> "Lab - Branch, address"; home collection -> booking address
        const labLabel = [lab.labName || order.labType, lab.branchName].filter(Boolean).join(' - ');
        const location = lab.branchAddress
            ? `${labLabel}, ${lab.branchAddress}`
            : [labLabel, order.bookingAddress || order.labCityName].filter(Boolean).join(', ');

        return {
            name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
            corporateName: company?.company_name,
            date: order.bookingDate,
            time: order.bookingTime,
            location,
            requestId: order.uniqueBookingId || order.id,
        };
    }

    // care navigators assigned to the patient's company - matched on companyId OR employer_id,
    // the same way the care navigator portal lists the patient's lab orders
    static async getCareNavigatorsForPatient(patient){
        const companyIds = [patient.companyId, patient.employer_id]
            .filter((id) => Number(id) > 0)
            .map(String);
        if (!companyIds.length) {
            console.warn(`No company on patient ${patient.id}; no care navigator to notify`);
            return [];
        }
        const careNavigators = await sequelizeDB1.query(`
            SELECT id, name, email FROM carenavigator
            WHERE (${companyIds.map((_, i) => `FIND_IN_SET(:c${i}, REPLACE(companyId, ' ', '')) > 0`).join(' OR ')})`, {
            replacements: Object.fromEntries(companyIds.map((id, i) => [`c${i}`, id])),
            type: QueryTypes.SELECT
        });
        if (!careNavigators.length) {
            console.warn(`No care navigator assigned to company ${companyIds.join('/')} (patient ${patient.id})`);
        }
        return careNavigators;
    }

    // 'allowed' when the order's patient belongs to one of the care navigator's companies,
    // otherwise 'forbidden'; 'not_found' when the order or its patient does not exist
    static async getCareNavigatorOrderAccess(careNavigatorId, orderId){
        const order = await LabOrder.findOne({ where: { id: orderId, isDeleted: false }, attributes: ['id', 'patientId'] });
        if (!order) return 'not_found';
        const patient = await Patient.findOne({ where: { id: order.patientId } });
        if (!patient) return 'not_found';
        const careNavigators = await this.getCareNavigatorsForPatient(patient);
        return careNavigators.some((row) => Number(row.id) === Number(careNavigatorId)) ? 'allowed' : 'forbidden';
    }

    // email + in-app notification to the patient's care navigators about a health check-up.
    // kind: 'review' (new request), 'confirmed' (approved), 'rescheduled' (approved booking moved;
    // extra.previousDate/previousTime = slot before the move), 'cancelled' (extra.cancelledBy), 'completed'
    // or 'reportGenerated' (extra.reportId, extra.portalStatus)
    static async notifyCareNavigators(patient, emailData, kind, extra = {}){
        const { name, requestId, date, time } = emailData;
        const { previousDate, previousTime, cancelledBy, reportId, portalStatus } = extra;
        const byKind = {
            review: {
                template: EmailTemplates.healthCheckupReviewCareNavigator,
                title: "Health Check-up Request Needs Review",
                description: `${name}'s health check-up request (Request ID ${requestId}) needs review. Please check availability and update the status.`
            },
            confirmed: {
                template: EmailTemplates.healthCheckupConfirmedCareNavigator,
                title: "Health Check-up Booking Confirmed",
                description: `${name}'s health check-up booking (Booking ID ${requestId}) is confirmed for ${date} at ${time}.`
            },
            rescheduled: {
                template: EmailTemplates.healthCheckupRescheduledCareNavigator,
                title: "Health Check-up Appointment Rescheduled",
                description: `${name}'s health check-up (Booking ID ${requestId}) has been rescheduled from ${previousDate} at ${previousTime} to ${date} at ${time}.`
            },
            cancelled: {
                template: EmailTemplates.healthCheckupCancelledCareNavigator,
                title: "Health Check-up Booking Cancelled",
                description: `${name}'s health check-up booking (Booking ID ${requestId}) on ${date} at ${time} has been cancelled${cancelledBy ? ` by ${cancelledBy}` : ''}.`
            },
            completed: {
                template: EmailTemplates.healthCheckupCompletedCareNavigator,
                title: "Health Check-up Marked Completed",
                description: `${name}'s health check-up (Booking ID ${requestId}) has been marked as completed. Track the report if one is expected.`
            },
            reportGenerated: {
                template: EmailTemplates.healthCheckupReportGeneratedCareNavigator,
                title: "Health Check-up Report Generated",
                description: `${name}'s health check-up report (Booking ID ${requestId}) has been generated. Portal status: ${portalStatus}.`
            }
        };
        const { template, title, description } = byKind[kind];
        const careNavigators = await this.getCareNavigatorsForPatient(patient);
        for (const row of careNavigators) {
            const { subject, html } = template({
                careNavigatorName: row.name,
                customerName: name,
                corporateName: emailData.corporateName,
                date,
                time,
                location: emailData.location,
                requestId,
                previousDate,
                previousTime,
                cancelledBy,
                reportId,
                portalStatus,
            });
            // one failure must not stop the remaining care navigators from being notified
            try {
                if (row.email) await emailHelperSMTP(row.id, row.email, subject, html);
                await NotificationService.createNotification({
                    "title": title,
                    "description": description,
                    "referenceId": row.id,
                    "role": "careNavigator"
                });
            } catch (err) {
                console.error(`Care navigator ${row.id} health check-up notification failed:`, err);
            }
        }
    }

    // city and sub city the patient chose for the order
    static async getOrderLocation(orderId){
        const query = `
            SELECT
                lo.labCityName,
                (SELECT MIN(lc.id) FROM labCities lc WHERE lc.cityName = lo.labCityName AND lc.isActive = 1) AS labCityId,
                lo.sub_city_id AS subCityId,
                lo.labBranchId
            FROM labOrders lo
            WHERE lo.id = :orderId
            LIMIT 1;
        `;
        const [location] = await sequelizeDB1.query(query, {
            replacements: { orderId },
            type: QueryTypes.SELECT
        });
        return location || null;
    }

    static async checkPamentRequired(patientId, companyId){
         const orderCall = `
           SELECT * from worksman_company_list WHERE id = :companyId;
        `; 
        const [companyDetails] = await sequelizeDB1.query(orderCall, {
            replacements: { companyId },
            type: QueryTypes.SELECT
        });
       return companyDetails.is_pament_required;
    }
    static async getUnpaidLabDetails(patientId){
        let query;
        let cartId;
        let labId;
        let querySingleItemFetch;
          const cart = await Cart.findOne({
            where: {
                patientId: patientId,
                isActive: true
            }
        });
        if(cart){
            cartId = cart.id;
            const query =  `SELECT DISTINCT
                        c.id AS cartId,
                        c.labId AS cartLabId,
                        c.labType AS cartLabType,
                        c.code AS cartCode,

                        cd.id AS itemId,
                        cd.type AS itemType,
                        cd.mode AS itemMode,
                        cd.referenceId,
                        cd.companyId,
                        cd.labId AS labId11,
                        cd.labType AS labType,
                        cd.code AS code,                
                        cd.patientId,
                        p.packageName,
                        p.noOfTest,
                        pa.address1 AS address,
                        pa.city,
                        pa.state,
                        pa.zip_code AS pincode,
                        t.name AS testName,
                        t.description,
                        cl.companyId,
                        CASE 
                            WHEN cd.mode = 'Pathology' THEN l.labName
                            ELSE NULL
                        END AS labName,
                        CASE 
                            WHEN cd.mode = 'Pathology' THEN l.description
                            ELSE NULL
                        END AS labDescription,
                        CASE 
                            WHEN cd.mode = 'Pathology' THEN cl.labId
                            ELSE NULL
                        END AS labId,
                        CASE 
                            WHEN cd.mode = 'Pathology' THEN cl.price
                            ELSE NULL
                        END AS price,
                        CASE 
                            WHEN cd.mode = 'Pathology' THEN cl.discount
                            ELSE NULL
                        END AS discount
                    FROM
                        cart c
                    LEFT JOIN
                        patient pa ON pa.id = :patientId
                    LEFT JOIN
                        cartDetails cd ON cd.cartId = c.id
                    LEFT JOIN
                        connectedCompaniesLabPackages ccpt ON cd.referenceId = ccpt.labPackageId AND cd.type = 2
                    LEFT JOIN
                        labPackages p ON ccpt.labPackageId = p.id
                    LEFT JOIN
                        connectedCompaniesLabTests cct ON cd.referenceId = cct.labTestId AND cd.type = 1
                    LEFT JOIN
                        labTests t ON cct.labTestId = t.id
                   
                    LEFT JOIN
                        connectedLabs cl ON cd.referenceId = cl.referenceId 
                        AND cl.type = cd.type 
                        AND cl.isActive = 1 
                        AND cd.companyId = cl.companyId
                    
                    LEFT JOIN
                        labs l ON cl.labId = l.id
                    WHERE
                        c.id = :cartId
                        AND c.patientId = :patientId
                        AND cd.isDeleted = 0
                        AND c.isActive = 1              
                        AND (
                            (cd.mode = 'Radiology' AND cl.price IS NOT NULL)
                            OR (cd.mode = 'Pathology' AND cd.type = 1 AND t.price IS NOT NULL)
                            OR (cd.mode = 'Pathology' AND cd.type = 2 AND cl.price IS NOT NULL)
                        );`

                return await sequelizeDB1.query(query, {
                    replacements: { cartId, patientId},
                    type: QueryTypes.SELECT
                });
        // }
        }else{
            throw new Error("Your cart is empty!");
        }
            
    }
    // send notification by carenavigator
    static async sentCareNavigatorNotification(patientId,status,fDate,fTime,tDate,tTime,requestId){

                const patient = await Patient.findOne({ where: { id:patientId } });
                const results_care = await this.getCareNavigatorsForPatient(patient);

                      if(status == "confirmed"){ // Send Notifications
                        for (const row of results_care) {
                            const patientName = patient.first_name + ' ' + patient.last_name;
                            await emailHelperSMTP(
                                row.id, 
                                row.email, ...Object.values(EmailTemplates.bookingStatusCareNavigator({ careNavigatorName: row.name, patientName, status: 'confirmed', requestId }))); 
                            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been successfully confirmed. Team AkosMD`;
                            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                            const patientNotifyData = {
                                "title": "Lab Booking Confirmed",
                                "description": `${patientName}'s lab test booking has been successfully confirmed.`,
                                "referenceId":  row.id,
                                "role": "careNavigator"
                            };
                            await NotificationService.createNotification(patientNotifyData);
                        }                       
                    }
                    if(status == "cancelled"){ // Send Notifications
                        for (const row of results_care) {
                            const patientName = patient.first_name +' '+patient.last_name;
                            await emailHelperSMTP(  row.id, 
                                    row.email, ...Object.values(EmailTemplates.bookingStatusCareNavigator({ careNavigatorName: row.name, patientName, status: 'cancelled', requestId })));      
                            // Create SMS messages with dynamic content
                            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been cancelled. Team AkosMD`;

                            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                            //Trigger Notification
                            const patientNotifyData = {
                                "title" : "Lab Booking Cancelled",
                                "description": `We are pleased to inform you that ${patientName}'s lab test booking has been cancelled.`,
                                "referenceId":  row.id,
                                "role" : "careNavigator"
                            }
                            NotificationService.createNotification(patientNotifyData);
                           
                        }
                    }
                    if(status == "Completed"){ // Send Notifications
                         for (const row of results_care) {
                            const patientName = patient.first_name +' '+patient.last_name;
                            await emailHelperSMTP(row.id, 
                                    row.email, ...Object.values(EmailTemplates.bookingStatusCareNavigator({ careNavigatorName: row.name, patientName, status: 'completed', requestId })));      
                            // Create SMS messages with dynamic content
                            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been Completed. Team AkosMD`;

                            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                            //Trigger Notification
                            const patientNotifyData = {
                                "title" : "Lab Booking Completed",
                                "description": `We are pleased to inform you that ${patientName}'s lab test booking has been Completed.`,
                                "referenceId":  row.id,
                                "role" : "careNavigator"
                            }
                            NotificationService.createNotification(patientNotifyData);
                           
                        }
                    }
                    if(status == "Report Generated"){ // Send Notifications
                        for (const row of results_care) {
                            const patientName = patient.first_name +' '+patient.last_name;
                            await emailHelperSMTP(row.id, 
                                    row.email, ...Object.values(EmailTemplates.bookingStatusCareNavigator({ careNavigatorName: row.name, patientName, status: 'reportGenerated', requestId })));      
                            // Create SMS messages with dynamic content
                            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

                            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                            //Trigger Notification
                            const patientNotifyData = {
                                "title" : "Lab Booking Completed",
                                "description": `We are pleased to inform you that ${patientName}'s lab test booking Report has been Generated.`,
                                "referenceId":  row.id,
                                "role" : "careNavigator"
                            }
                            NotificationService.createNotification(patientNotifyData);
                           
                        }
                    }
                     if(status == "Reschedule"){ // Send Notifications
                        for (const row of results_care) {
                            const patientName = patient.first_name +' '+patient.last_name;
                            await emailHelperSMTP(row.id, 
                                    row.email, ...Object.values(EmailTemplates.bookingStatusCareNavigator({ careNavigatorName: row.name, patientName, status: 'rescheduled', requestId, fromDate: fDate, fromTime: fTime, toDate: tDate, toTime: tTime })));      
                            // Create SMS messages with dynamic content
                            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

                            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                            //Trigger Notification
                            const patientNotifyData = {
                                "title" : "Lab Booking Completed",
                                "description": `We are pleased to inform you that ${patientName}'s lab test booking Report has been rescheduled from date ${fDate} and time ${fTime} to ${tDate} and time ${tTime}.`,
                                "referenceId":  row.id,
                                "role" : "careNavigator"
                            }
                            NotificationService.createNotification(patientNotifyData);
                           
                        }
                    }
                    return 1;

    }
}

module.exports = labTestService;
