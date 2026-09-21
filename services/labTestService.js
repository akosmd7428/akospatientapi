const { sequelizeDB1 } = require('../config/sequelize');
const { randomDigits } = require('../helpers/secureRandom'); // SEC-018
const { toIdList } = require('../helpers/sqlSafe'); // SEC-006
const { QueryTypes } = require('sequelize');
const LabTestPrescription = require('../models/labTestPrescriptions');
const LabCity = require('../models/labCity');
const LabOrder = require('../models/labOrder');
const LabOrderDetails = require('../models/labOrderDetails');
const Cart = require('../models/cart');
const CartDetails = require('../models/cartDetail');
const LabTest = require('../models/labTest');       // SEC-013: server-side pricing
const LabPackage = require('../models/labPackage'); // SEC-013: server-side pricing
const fs = require('fs').promises;    
const path = require('path');
const { logError } = require('../helpers/logErrorHelper');
const { PATIENT_BACKEND_URL, DEV_PAYUMONEY_LINK, DEV_PAYU_MONEY_SALT, DEV_PAYU_MONEY_KEY, DEV_PAYU_SUCCESS_URL, DEV_PAYU_FAILED_URL, DEV_PAYU_CANCEL_URL,REDCLIFF_BASE_URL,REDCLIFF_COOKIE,REDCLIFF_KEY } = require('../config/secret');
const axios = require('axios');
const Razorpay = require('razorpay');
const Patient = require('../models/patientModel');
const NotificationService = require('./notificationService');
const { sendSms } = require('./smsService');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const LabTestBookingAddress = require('../models/labTestBookingAddress');
const CareNavigator = require('../models/careNavigatorModel');
const SubscriptionPlanAvail = require('../models/subscriptionPlanAvail');

const PAYU_MONEY_API_URL = DEV_PAYUMONEY_LINK;
const PAYU_MONEY_KEY = DEV_PAYU_MONEY_KEY; // Replace with your actual key
const PAYU_MONEY_SALT = DEV_PAYU_MONEY_SALT; // Replace with your actual salt
const REDCLIFF_LAB_URL = REDCLIFF_BASE_URL;

class labTestService {
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

            // Generate file paths
            const year = new Date().getFullYear();
            const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
            const timestamp = Date.now();
            const fileName = `${type}_${timestamp}.${extension}`;
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
                throw new Error("This item already added into cart");
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
                        throw new Error("This item already added into cart");
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
                        throw new Error("This item already added into cart");
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

    static async removeCartItem(cartId) {
        // check cartId 
        const queryCart = `
            SELECT * FROM cartDetails
            WHERE id = :cartId;
        `;

        const cartResult = await sequelizeDB1.query(queryCart, {
            replacements: { cartId },
            type: QueryTypes.SELECT
        });
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
            await LabTestBookingAddress.update(updateData, {
                where: { id: patientId }
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

    /**
     * SEC-013: prices are looked up from our own catalogue rather than taken from
     * the request. type '1' is a lab test, type '2' is a package.
     *
     * An unknown or inactive reference is rejected rather than priced at zero.
     */
    static async priceOrderDetails(orderDetails, transaction) {
        if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
            throw new Error('An order must contain at least one item');
        }

        const items = [];
        let subtotal = 0;

        for (const detail of orderDetails) {
            const referenceId = Number(detail.referenceId);
            if (!Number.isInteger(referenceId) || referenceId <= 0) {
                throw new Error('Invalid order item reference');
            }

            let record;
            let name;
            if (String(detail.type) === '1') {
                record = await LabTest.findByPk(referenceId, { transaction });
                name = record && record.name;
            } else if (String(detail.type) === '2') {
                record = await LabPackage.findByPk(referenceId, { transaction });
                name = record && record.packageName;
            } else {
                throw new Error('Invalid order item type');
            }

            if (!record) {
                throw new Error('Unknown order item');
            }

            const price = Number(record.price) || 0;
            subtotal += price;

            items.push({
                cartId: detail.cartId,
                type: String(detail.type),
                referenceId,
                name,                       // from the catalogue, not the request
                modeOfTest: detail.modeOfTest,
                noOfTest: record.noOfTest || 1,
                price,
                discount: 0,
                total: price,
            });
        }

        return { items, subtotal, discount: 0, total: subtotal };
    }

    /**
     * SEC-013: this spread the entire request body into LabOrder.create, so a
     * client could set isPaid, paymentStatus, orderStatus, totalPrice and
     * patientId. Prices and payment state are now computed server-side and the
     * owning patient comes from the authenticated session, never the body.
     *
     * The `fields` option is a hard stop: attributes outside the list are ignored
     * even if somehow present on the object.
     */
    static async createLabOrder(data, patientId) {
        const { orderDetails } = data;

        const CLIENT_FIELDS = ['bookingDate', 'bookingTime', 'bookingAddress', 'labId', 'labCityName', 'labBranchId'];
        const SERVER_FIELDS = ['patientId', 'price', 'discountApplied', 'otherCharges', 'totalPrice', 'isPaid', 'orderStatus', 'paymentStatus', 'noOfTest'];

        const orderData = {};
        for (const key of CLIENT_FIELDS) {
            if (data[key] !== undefined) orderData[key] = data[key];
        }

        const transaction = await sequelizeDB1.transaction();

        try {
            // Prices come from our own catalogue, not from the request.
            const priced = await LabTestService.priceOrderDetails(orderDetails, transaction);

            orderData.patientId = patientId;
            orderData.price = priced.subtotal;
            orderData.discountApplied = priced.discount;
            orderData.otherCharges = 0;
            orderData.totalPrice = priced.total;
            orderData.noOfTest = priced.items.length;
            orderData.isPaid = false;
            orderData.orderStatus = 'pending';
            orderData.paymentStatus = 'unpaid';

            const labOrder = await LabOrder.create(orderData, {
                fields: [...CLIENT_FIELDS, ...SERVER_FIELDS],
                transaction,
            });

            const labOrderDetails = priced.items.map(detail => ({
                ...detail,
                labOrderId: labOrder.id,
                patientId,
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
                alreadyOrdered
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
                   isFree: is_pament_required === 1 ? 0 : alreadyOrdered === 1 ? 0 : companyIdPackageTest === patientCompanyId ? 1 : 0

                });                
            }

            return acc;
        }, []);

        return orders;
    }

    static async updateLabOrder(orderId, updateData, response) {

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
        if(status == "confirmed"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patientId, patient.email, 'Lab Booking Confirmed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been successfully confirmed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been successfully confirmed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Confirmed",
                "description": `We are pleased to inform you that your lab test booking has been successfully confirmed.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
            this.sentCareNavigatorNotification(orderDetail.patientId,status);
            
        }
        if(status == "cancelled"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patientId, patient.email, 'Lab Booking Cancelled', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been cancelled.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been cancelled. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Cancelled",
                "description": `We are pleased to inform you that your lab test booking has been cancelled.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
            this.sentCareNavigatorNotification(orderDetail.patientId,status);
        }
        if(status == "Completed"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patientId, patient.email, 'Lab Booking Completed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been Completed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking has been Completed. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Completed",
                "description": `We are pleased to inform you that your lab test booking has been Completed.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
            this.sentCareNavigatorNotification(orderDetail.patientId,status);
        }
        if(status == "Report Generated"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patientId, patient.email, 'Lab Booking Report Generated', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking Report has been Generated.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Completed",
                "description": `We are pleased to inform you that your lab test booking Report has been Generated.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
            this.sentCareNavigatorNotification(orderDetail.patientId,status);
        }
          if(status == "Reschedule"){ // Send Notifications
            const patientName = patient.first_name +' '+patient.last_name;
            await emailHelperSMTP(orderDetail.patientId, patient.email, 'Lab Booking Report Generated', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking Report has been rescheduled from date ${orderDetailPrev.bookingDate} and time ${orderDetailPrev.bookingTime} to ${orderDetail.bookingDate} and time ${orderDetail.bookingTime} .<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            // Create SMS messages with dynamic content
            // const patientSMSMsg = `Hi ${patientName}, We are pleased to inform you that your lab test booking Report has been Generated.. Team AkosMD`;

            // await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            //Trigger Notification
            const patientNotifyData = {
                "title" : "Lab Booking Completed",
                "description": `We are pleased to inform you that your lab test booking has been Rescheduled from date ${orderDetailPrev.bookingDate} and time ${orderDetailPrev.bookingTime} to ${orderDetail.bookingDate} and time ${orderDetail.bookingTime}.`,
                "referenceId": orderDetail.patientId,
                "role" : "patient"
            }
            const fDate = orderDetailPrev.bookingTime;
            const fTime = orderDetailPrev.bookingTime;
            const tDate = orderDetail.bookingTime;
            const tTime = orderDetail.bookingTime;
            NotificationService.createNotification(patientNotifyData);
            this.sentCareNavigatorNotification(orderDetail.patientId,status,fDate,fTime,tDate,tTime);
        }
        return result;
    }

    static async updateCart(cartId, updateData) {
        const result = await Cart.update(updateData, {
            where: { id: cartId }
        });
        return result;
    }
    
    static async removeCart(cartId) {
        const cartQuery = `
            DELETE FROM cartDetails
            WHERE cartId = :cartId;
        `;
        const query = `
            DELETE FROM cart
            WHERE id = :cartId;
        `;

        await sequelizeDB1.query(cartQuery, {
            replacements: { cartId },
            type: QueryTypes.DELETE
        });

        await sequelizeDB1.query(query, {
            replacements: { cartId },
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
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labOrderDetails lod ON lo.id = lod.labOrderId
                JOIN 
                    labs l ON lo.labId = l.id
                WHERE 
                    lo.patientId = :patientId
                    AND lo.isPaid = 1
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
                    lo.labReportURL
                FROM 
                    labOrders lo
                JOIN 
                    labOrderDetails lod ON lo.id = lod.labOrderId
                JOIN 
                    labs l ON lo.labId = l.id
                JOIN 
                    patient p ON lo.patientId = p.id
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
                    AND (p.companyId IN (${toIdList(careCompanyIds, 'company id')}) OR p.employer_id IN (${toIdList(careCompanyIds, 'company id')}))
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
                    AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')})
                ORDER BY 
                    lo.bookingDate DESC
                LIMIT 5
            `;
          
            const results = await sequelizeDB1.query(query, {
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

            const amountInPaise = totalPrice*100;

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
                this.updateOrderRazopay(order.id,order.notes.orderId);
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

            const amountInPaise = totalPrice*100;

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
                this.updateOrderRazopay(order.id,order.notes.orderId);
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
                AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')})
            ORDER BY 
                ltp.createdAt DESC;
        `;
    
        const prescriptions = await sequelizeDB1.query(query, {
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
        const alocData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-location-2-eloc?place_query="+areaString, payload);
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
        console.log(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-loc-2-eloc/?eloc="+aloc);
        const latLongData = await axios.get(REDCLIFF_LAB_URL+"api/partner/v2/get-partner-loc-2-eloc/?eloc="+aloc, payload);        
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
        console.log(REDCLIFF_LAB_URL+"api/booking/v2/get-time-slot-list/?collection_date="+collection_date+"&latitude="+lat+"&longitude="+long);
        const collectionSlot = await axios.get(REDCLIFF_LAB_URL+"api/booking/v2/get-time-slot-list/?collection_date="+collection_date+"&latitude="+lat+"&longitude="+long, payload); 
        return collectionSlot;
    }
    // create booking in redcliff
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

            const amountInPaise = totalPrice*100;

            const randomSixDigit = Number(randomDigits(8));

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
                this.updatePaymentCallRazopay(order.id,order.notes.orderId);
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
        if (total_price <= 0) {
            throw new Error('Total price must be greater than zero!');
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
            await emailHelperSMTP(orderDetail.patient_id, patient.email, 'Lab Booking Confirmed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been successfully confirmed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
            await emailHelperSMTP(orderDetail.patient_id, patient.email, 'Call Booking Cancelled', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your call booking has been cancelled.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
            await emailHelperSMTP(orderDetail.patient_id, patient.email, 'Call Booking Completed', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your lab test booking has been Completed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
            await emailHelperSMTP(orderDetail.patient_id, patient.email, 'Call Booking Report Generated', `<p>Hi ${patientName}, <br/></br>We are pleased to inform you that your call booking Report has been Generated.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
        console.log("ser",patient_id)
         if (coupon_code  == '' && patient_id == '') {
            throw new Error('Please provide valid data!');
        }
        const insertQuery = `SELECT * from
                                patient_coupon
                            where
                                patient_id = :patient_id
                            AND
                                coupon_code = :coupon_code
                            AND
                                status = 1    
                            `;

            const insertReplacements = {
                patient_id,
                coupon_code               
            };
           const [result] = await sequelizeDB1.query(insertQuery, {
                type: QueryTypes.SELECT,
                replacements: insertReplacements
            }); 
            // update status
             const orderLabQuesry = `
           update patient_coupon set status = 2
             where
                patient_id = :patient_id
            AND
                coupon_code = :coupon_code
        `; 

         const updateReplacements = {
                patient_id,
                coupon_code               
            };

        await sequelizeDB1.query(orderLabQuesry, {
            replacements: updateReplacements,
            type: QueryTypes.UPDATE
        });


            const data = {};
            if(result){
                data.is_verified = 1; 
            }else{
                data.is_verified = 0; 
            }
            return data;
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
    static async sentCareNavigatorNotification(patientId,status,fDate,fTime,tDate,tTime){

                const patient = await Patient.findOne({ where: { id:patientId } });
                 // get company id of the patient
                const patient_company_id = patient.companyId;
                const query_care_navigator = `SELECT * FROM akosmd_live.carenavigator WHERE FIND_IN_SET(:patient_company_id, companyId) > 0`;
                    const results_care = await sequelizeDB1.query(query_care_navigator, {
                        replacements: { patient_company_id },
                        type: QueryTypes.SELECT
                    });

                      if(status == "confirmed"){ // Send Notifications
                        for (const row of results_care) {
                            const patientName = patient.first_name + ' ' + patient.last_name;
                            await emailHelperSMTP(
                                row.id, 
                                row.email, 
                                'Lab Booking Confirmed', 
                                `<p>Hi ${row.name}, <br/><br/>We are pleased to inform you that ${patientName}'s lab test booking has been successfully confirmed.<br/><br/>Thank you!<br/>Team AkosMD</p>`
                            ); 
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
                                    row.email, 
                                    'Lab Booking Cancelled', `<p>Hi ${row.name}, <br/></br>We are pleased to inform you that ${patientName}'s lab test booking has been cancelled.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
                                    row.email,  'Lab Booking Completed', `<p>Hi ${row.name}'s, <br/></br>We are pleased to inform you that your lab test booking has been Completed.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
                                    row.email,  'Lab Booking Report Generated', `<p>Hi ${row.name}'s, <br/></br>We are pleased to inform you that your lab test booking Report has been Generated.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
                                    row.email,  'Lab Booking Report Generated', `<p>Hi ${row.name}'s, <br/></br>We are pleased to inform you that your lab test booking Report has been rescheduled from date ${fDate} and time ${fTime} to ${tDate} and time ${tTime}.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      
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
