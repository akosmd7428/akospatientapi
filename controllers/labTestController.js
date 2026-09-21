const LabTestService = require('../services/labTestService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const LabOrder = require('../models/labOrder');
const LabTestPrescription = require('../models/labTestPrescriptions');
// SEC-011: object-level authorization for identifiers supplied by the caller.
const { assertCanAccessPatient, assertCanAccessRecord } = require('../helpers/authorization');
const { ROLES } = require('../middleware/requireAuth');

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
            const { prescriptionFile, notes } = req.body;
            // SEC-011: patientId came from the body with no ownership check.
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);

            const prescription = await LabTestService.uploadPrescription({ prescriptionFile, notes, patientId });
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionUpload, { prescription });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
  
    static async addToCart(req, res) {
        try {
           // console.log(req.body,"card Item");
            const { type, mode, referenceId, companyId,labId,labType,code} = req.body;
            // SEC-011
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);

            const cartItem = await LabTestService.addToCart({ patientId, type, mode, referenceId, companyId, labId, labType, code });
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
            const { companyId, cityName } = req.body;
            // SEC-011
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);

            const labDetails = await LabTestService.getLabDetailsByCart(companyId, patientId, cityName);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labDetailsFetched, { labDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getCartDetailsByPatientId(req, res) {
        try {
            // SEC-011: patientId came from the body with no ownership check.
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);

            const cartDetails = await LabTestService.getCartDetailsByPatientId(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.cartDetailsFetched, { cartDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getUnpaidLabForItem(req, res) {
        try {
            // SEC-011: patientId came from the body with no ownership check.
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);

            const cartDetails = await LabTestService.getUnpaidLabDetails(patientId);
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
            // SEC-011: patientId came from the path with no ownership check.
            const patientId = await assertCanAccessPatient(req.user, req.params.patientId);
            const prescription = await LabTestService.getPrescriptionUrl(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionFetched, { prescription });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async deletePrescription(req, res) {
        try {
            // SEC-011: any prescription could be deleted by id, with no owner check.
            await assertCanAccessRecord(req.user, LabTestPrescription, req.params.prescriptionId);
            const { prescriptionId } = req.params;
            await LabTestService.deletePrescription(prescriptionId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionDeleted);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async createLabOrder(req, res) {
        try {
            // SEC-013: the order is bound to the authenticated patient. Staff
            // acting for a patient must pass an explicitly authorised patientId.
            const patientId = req.user.role === ROLES.PATIENT
                ? req.user.id
                : await assertCanAccessPatient(req.user, req.body.patientId);
            const labOrder = await LabTestService.createLabOrder(req.body, patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.orderCreated, { labOrder });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabOrdersByPatient(req, res) {
        try {
            // SEC-011: the order id was read with no check that it belongs to the caller.
            await assertCanAccessRecord(req.user, LabOrder, req.params.orderId);
            const { orderId } = req.params;
            const labOrders = await LabTestService.getLabOrdersByPatientId(orderId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.ordersFetched, { labOrders });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateLabOrder(req, res) {

        const { orderId, totalPrice, bookingDate, bookingTime, bookingAddress, slotId, availableSlotId } = req.body;
        try {
            const updateData = {
                "totalPrice": totalPrice,
                "bookingDate": bookingDate,
                "bookingTime": bookingTime,
                "bookingAddress": bookingAddress,
                "slotId":slotId,
                "availableSlotId":availableSlotId
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
        // SEC-011
        const patientId = await assertCanAccessPatient(req.user, req.params.patientId);
    
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
                    "orderStatus": "Payment Completed",
                    "paymentStatus": "paid"
                }
            }      
            const result = await LabTestService.updateLabOrder(orderId, updateData, response);
            // booking redcliff and other third party lab schedule booking
            // get order details
            // const checkRedCliff = await LabTestService.checkRedclifforder(orderId, updateData, response);
            // if(checkRedCliff == 1){
             //    const redCliff = await LabTestService.updateThirdPartyLab(orderId, updateData, response);
            // }           
            // if (result[0] === 0) {
            //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            // }
            if(status == "success"){
                await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed);
            }else{
                //return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Payment failed");
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_402_PAYMENT_REQUIRED,messages.paymentFailed,{});
            }
        } catch (error) {
            console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 

    }

    static async paymentStatusMobile(req, res){
       // console.log(req.body,"==== payment");
        try {
            const {razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;           
            let updateData; 
            let response;  
            if(razorpay_payment_id!=''){
               const orderDetail = await LabTestService.getOrderDetailsByRazorpayOrder(razorpay_order_id);              
               const { id } = orderDetail;
               console.log(id);
             //  let orderId = id;
               updateData = {
                "isPaid": true,
                "orderStatus": "confirmed",
                "paymentStatus": "paid"
                }; 
                const result = await LabTestService.updateLabOrder(id, updateData, response);
                if (result[0] === 0) {
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
                }
            }     
           
            if(razorpay_payment_id != ""){
               // await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed);
            }else{
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Payment failed");
            }
        } catch (error) {
          //  console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 

    }
    
    static async purchaseLabTest(req, res) {
        try {
            const { totalPrice, cartId, orderId } = req.body;
            // SEC-011: patientId is authorised, not trusted.
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);
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
                        "orderStatus": "Payment Completed",
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
            if(labOrderDetail && labOrderDetail.uniqueBookingId != null){
                  if(totalPrice > 0){
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
            const { totalPrice, cartId, orderId } = req.body;
            // SEC-011: patientId is authorised, not trusted.
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);
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

     // redcliff aloc number
    static async getRedcliffAloc(req, res){     
        console.log("lkllk");
        try {    
            //const address = await LabTestService.getLabTestAddress(req.query.id);  
            //let state = address.state; 
            //let city = address.city;   
            let areaString = req.query.area  
             console.log("lkllk",areaString);
            const redcliff_aloc = await LabTestService.getRedcliffAloc(areaString);          
            // latitudae and langitude
            const derdata = redcliff_aloc.data;   
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { redcliff_aloc });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 
    }
    // get slot of the particualr date
    static async getBookingSlot(req, res){
        try {    
            const {aloc,collection_date} = req.body;
            const latLong = await LabTestService.getRedcliffLatLong(aloc);
            console.log(latLong.data);          
            const lat = latLong.data.latitude;
            const long = latLong.data.longitude;
            const slotData = await LabTestService.getRedcliffCollectionSlot(collection_date,lat,long);
            const slots = slotData.data         
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { slots });
        } catch (error) {
            console.log(error.message);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // Create lab booking
    static async createRedcliffBooking(req, res){
        try {    
            const {order_id,patient_id} = req.body;                  
            const slotData = await LabTestService.createBookingRedcliff(order_id,patient_id);
            const slots = slotData;         
           // return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { slots });
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { slots });
        } catch (error) {
            console.log(error.message);
            //return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // get redcliff report
    static async redCliffReport(req,res){
          try {    
            const data= req.body;
            console.log("webhook ===",data);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { data });
        } catch (error) {
            console.log(error.message);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

      // get lab test report from redcliff 
    static async getRedcliffReport(req,res){
          try {    
            const data= req.body;
            console.log("webhook ===",data);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { data });
        } catch (error) {
            console.log(error.message);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    // check payment for call
    static async checkCallPaymentStatus(req,res){
        try {    
            const { patient_id, company_id } = req.query;
           // console.log(req.body);
           // const checkPatientForCall = await LabTestService.checkPatientForCall(patient_id, company_id);
           const check_pament_is_required = await LabTestService.checkPamentRequired(patient_id, company_id);
            if(check_pament_is_required == 1){
                const data = {
                    "is_paid":1
                }
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { data });
            }else{
                const data = {
                    "is_paid":0
                }
                 return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data Fetched Successfully", { data });
            }         
        } catch (error) {
            console.log(error.message);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }

    }
    // post payment for call 
    static async postPaymentCall(req,res){
         try {    
            const { patient_id, company_id, total_price, call_type, call_date, call_time } = req.body;
           // console.log("body", req.body)
            const checkPatientForCall = await LabTestService.postPayemntPatientForCall(patient_id, company_id,call_type,total_price, call_date, call_time);
        
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Data has been submitted", { checkPatientForCall });       
        } catch (error) {
            console.log(error.message);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // call payment status
    static async paymentStatusCallCheck( req, res){
        //console.log(req.body,"==== payment");
        try {
            const {orderId, status, response } = req.body;
            let updateData;
            //const orderId = response.order_id;
            if(status == "failed"){
                updateData = {
                    "order_status": 'Cancelled',
                    "payment_status": 'Failed',
                   
                }
            }
            if(status == "success"){
                updateData = {
                    "order_status": "Completed",
                    "payment_status": 'Paid'
                  
                }
            }      
            const result = await LabTestService.updateCallForPaymentStatus(orderId, updateData, response);
            // booking redcliff and other third party lab schedule booking
            // get order details
            // const checkRedCliff = await LabTestService.checkRedclifforder(orderId, updateData, response);
            // if(checkRedCliff == 1){
             //    const redCliff = await LabTestService.updateThirdPartyLab(orderId, updateData, response);
            // }           
            // if (result[0] === 0) {
            //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            // }
            if(status == "success"){
                //await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed,{updateData});
            }else{
                return CommonHelper.sendError(res,  STATUS_CODE.HTTP_402_PAYMENT_REQUIRED,messages.paymentFailed,{});
            }
        } catch (error) {
            console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 

    }
    // coupon verify
    static async verifyCallCoupan(req, res){
         try {
            const { patient_id, coupon_code} = req.body;
            let updateData;
            const result = await LabTestService.checkCouponCode(patient_id,coupon_code);
            
            if(result){
                //await LabTestService.removeCart(cartId);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.coupon_verified,{result});
            }else{
                
                
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "No coupon found",{result});
            }
        } catch (error) {
            console.log(error.message)
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        } 
    }
    // get lab item with code 
     static async labtestNotification(req, res){
        const { patient_id, status} = req.body;
        const result = await LabTestService.sentCareNavigatorNotification(patient_id,status);
         return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, "No coupon found",{result});
     }
    // reschedule lab
    static async labReschedule(req, res){
        const { orderId, bookingDate, bookingTime } = req.body;
        try {
            const updateData = {               
                "bookingDate": bookingDate,
                "bookingTime": bookingTime,
                "orderStatus": "Reschedule",
               
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
    

}

module.exports = labTestController;
