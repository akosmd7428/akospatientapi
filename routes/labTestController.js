const LabTestService = require('../services/labTestService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const LabOrder = require('../models/labOrder');

class labTestController {
    static async getPackagesAndTests(req, res) {
        try {
            const { companyId, search } = req.query;
            const result = await LabTestService.getPackagesAndTests(companyId, search);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async uploadPrescription(req, res) {
        try {
            const { prescriptionFile, notes, patientId } = req.body;

            const prescription = await LabTestService.uploadPrescription({ prescriptionFile, notes, patientId });
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionUpload, { prescription });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
  
    static async addToCart(req, res) {
        try {
            const { type, mode, referenceId, patientId } = req.body; 

            const cartItem = await LabTestService.addToCart({ patientId, type, mode, referenceId });
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.itemAddedToCart, { cartItem });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getAllActiveCities(req, res) {
        try {
            const cities = await LabTestService.getAllActiveCities();
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.citiesFetched, { cities });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabDetailsByCart(req, res) {
        try {
            const { companyId, patientId, cityName } = req.body;

            const labDetails = await LabTestService.getLabDetailsByCart(companyId, patientId, cityName);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labDetailsFetched, { labDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getCartDetailsByPatientId(req, res) {
        try {
            const { patientId } = req.body;

            const cartDetails = await LabTestService.getCartDetailsByPatientId(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.cartDetailsFetched, { cartDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getBranchesByLabAndCity(req, res) {
        try {
            const { labId, labCityId } = req.body;

            const branches = await LabTestService.getBranchesByLabAndCity(labId, labCityId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.branchesFetched, { branches });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    

    static async getTestsAndPackagesByLab(req, res) {
        try {
            const { companyId, search, labId, cartId } = req.body;

            const result = await LabTestService.getTestsAndPackagesByLab(companyId, search, labId, cartId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, result);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getTestOrPackageDetails(req, res) {
        try {
            const { id, type } = req.body;

            const result = await LabTestService.getTestOrPackageDetails(parseInt(id, 10), parseInt(type, 10));

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async removeCartItem(req, res) {
        try {
            const { cartId } = req.params;

            const result = await LabTestService.removeCartItem(cartId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.cartItemRemoved, result);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async removeCart(req, res) {
        try {
            const { cartId } = req.params;

            const result = await LabTestService.removeCart(cartId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.cartItemsRemoved, result);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getPrescriptionUrl(req, res) {
        try {
            const { patientId } = req.params;
            const prescription = await LabTestService.getPrescriptionUrl(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionFetched, { prescription });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async deletePrescription(req, res) {
        try {
            const { prescriptionId } = req.params;
            await LabTestService.deletePrescription(prescriptionId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionDeleted);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async createLabOrder(req, res) {
        try {
            const labOrder = await LabTestService.createLabOrder(req.body);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.orderCreated, { labOrder });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabOrdersByPatient(req, res) {
        try {
            const { orderId } = req.params;
            const labOrders = await LabTestService.getLabOrdersByPatientId(orderId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.ordersFetched, { labOrders });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateLabOrder(req, res) {

        const { orderId, totalPrice, bookingDate, bookingTime, bookingAddress } = req.body;
        try {
            const updateData = {
                "totalPrice": totalPrice,
                "bookingDate": bookingDate,
                "bookingTime": bookingTime,
                "bookingAddress": bookingAddress
            }
            const result = await LabTestService.updateLabOrder(orderId, updateData);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labOrderUpdated, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateLabId(req, res) {

        const { cartId, labId, labBranchId, labCityName } = req.body;
        try {
            const updateData = {
                "labId": labId,
                "labBranchId": labBranchId,
                "labCityName" : labCityName
            }
            const result = await LabTestService.updateCart(cartId, updateData);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.cartNotFound );
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.cartUpdated, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }    

    static async getLabOrders(req, res) {
        const patientId = req.params.patientId;
    
        try {
            const data = await LabTestService.getLabOrdersByPatient(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labTestsFetched, { data });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);

        }
    };

    static async getLabDetail(req, res) {
        const cartId = req.params.cartId;
    
        try {
            const data = await LabTestService.getLabDetail(cartId);
            const cartDetails = await LabTestService.getCartDetailsByCart(cartId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labTestsFetched, { data, cartDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    };

    static async paymentStatus(req, res){
        //console.log(req.body,"==== payment");
        try {
            const { cartId, orderId, status, response } = req.body;
            let updateData;
            if(status == "failed"){
                updateData = {
                "isPaid": false,
                    "orderStatus": "pending",
                    "paymentStatus": "failed"
                }
            }
            if(status == "success"){
                updateData = {
                    "isPaid": true,
                    "orderStatus": "confirmed",
                    "paymentStatus": "paid"
                }
            }        
        
            const result = await LabTestService.updateLabOrder(orderId, updateData, response);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            if(status == "success"){
                await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed);
            }else{
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Payment failed");
            }
        } catch (error) {
            console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 

    }

    static async paymentStatusMobile(req, res){
        //console.log(req.body,"==== payment");
        try {
            const { cartId, orderId, status, response } = req.body;
            let updateData;
            if(status == "failed"){
                updateData = {
                "isPaid": false,
                    "orderStatus": "pending",
                    "paymentStatus": "failed"
                }
            }
            if(status == "success"){
                updateData = {
                    "isPaid": true,
                    "orderStatus": "confirmed",
                    "paymentStatus": "paid"
                }
            }        
        
            const result = await LabTestService.updateLabOrder(orderId, updateData, response);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            if(status == "success"){
                await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed);
            }else{
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Payment failed");
            }
        } catch (error) {
            console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 

    }
    
    
    static async purchaseLabTest(req, res) {
        try {
            const { patientId, totalPrice, cartId, orderId } = req.body;
            const uniqueBookingId = Math.floor(10000 + Math.random() * 90000);
            const labOrderDetail = await LabOrder.findOne({ 
                where: { id: orderId },
                attributes: ['uniqueBookingId', 'paymentStatus', 'orderStatus'],
            });
            if(labOrderDetail && labOrderDetail.uniqueBookingId != null && labOrderDetail.paymentStatus == "unpaid" && labOrderDetail.orderStatus == "pending"){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK,messages.paymentInitiated );
            }
            if(labOrderDetail && labOrderDetail.paymentStatus == "paid" && labOrderDetail.orderStatus == "confirmed"){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK,messages.orderProcessAlready);
            }
            if(labOrderDetail && labOrderDetail.uniqueBookingId == null){
                if(totalPrice == 0){ //Means Free
                    const updateData = {
                        "totalPrice": totalPrice,
                        "uniqueBookingId" : uniqueBookingId,
                        "isPaid": true,
                        "orderStatus": "confirmed",
                        "paymentStatus": "paid"
                    }
                    const result = await LabTestService.updateLabOrder(orderId, updateData);
                    if (result[0] === 0) {
                        return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
                    }
                    await LabTestService.removeCart(cartId);
                    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed, { uniqueBookingId });
                }else{ // When it's paid
                    const updateData = {
                        "totalPrice": totalPrice,
                        "uniqueBookingId" : uniqueBookingId,
                        "isPaid": false,
                        "orderStatus": "pending",
                        "paymentStatus": "unpaid"
                    }
                    const paymentDetail = await LabTestService.purchaseLabTest(orderId, updateData, totalPrice, patientId, cartId);
                    if(paymentDetail && paymentDetail.status == 'created'){
                        const updateData = {                        
                            "paymentStatus": "Payment Initiated"
                        }
                        await LabTestService.updateLabOrder(orderId, updateData);
                        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.paymentLinkGenerated, { paymentDetail });
                    }
                    else{
                        throw("Error while generating payment link");
                    }
                }
            }
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async purchaseLabTestMobile(req, res) {
        try {
            const { patientId, totalPrice, cartId, orderId } = req.body;
            const uniqueBookingId = Math.floor(10000 + Math.random() * 90000);
            const labOrderDetail = await LabOrder.findOne({ 
                where: { id: orderId },
                attributes: ['uniqueBookingId', 'paymentStatus', 'orderStatus'],
            });
            if(labOrderDetail && labOrderDetail.uniqueBookingId != null && labOrderDetail.paymentStatus == "unpaid" && labOrderDetail.orderStatus == "pending"){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK,messages.paymentInitiated );
            }
            if(labOrderDetail && labOrderDetail.paymentStatus == "paid" && labOrderDetail.orderStatus == "confirmed"){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK,messages.orderProcessAlready);
            }
            if(labOrderDetail && labOrderDetail.uniqueBookingId == null){
                if(totalPrice == 0){ //Means Free
                    const updateData = {
                        "totalPrice": totalPrice,
                        "uniqueBookingId" : uniqueBookingId,
                        "isPaid": true,
                        "orderStatus": "confirmed",
                        "paymentStatus": "paid"
                    }
                    const result = await LabTestService.updateLabOrder(orderId, updateData);
                    if (result[0] === 0) {
                        return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
                    }
                    await LabTestService.removeCart(cartId);
                    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed, { uniqueBookingId });
                }else{ // When it's paid
                    const updateData = {
                        "totalPrice": totalPrice,
                        "uniqueBookingId" : uniqueBookingId,
                        "isPaid": false,
                        "orderStatus": "pending",
                        "paymentStatus": "unpaid"
                    }
                    const paymentDetail = await LabTestService.purchaseLabTestMobile(orderId, updateData, totalPrice, patientId, cartId);
                    if(paymentDetail && paymentDetail.status == 'created'){
                        const updateData = {                        
                            "paymentStatus": "Payment Initiated"
                        }
                        await LabTestService.updateLabOrder(orderId, updateData);
                        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.paymentLinkGenerated, { paymentDetail });
                    }
                    else{
                        throw("Error while generating payment link");
                    }
                }
            }
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateAddress(req, res){
        try {
            const { id, address, pincode, state, city } = req.body;        
            await LabTestService.updateAddress(id, address, pincode, state, city, req.user.id);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Updated Data successfully");
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 
    }

    static async getLabTestAddress(req, res){
        try {
            const address = await LabTestService.getLabTestAddress(req.user.id);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { address });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 
    }

}

module.exports = labTestController;
