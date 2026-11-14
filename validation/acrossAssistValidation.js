const Joi = require('joi');

// optional text / number / list fields, null and '' are allowed because the partner sends them that way
const str = (max = 500) => Joi.string().trim().max(max).allow('', null).optional();
const num = () => Joi.number().allow(null).optional();
const strList = (max = 500) => Joi.array().items(Joi.string().trim().max(max).allow('')).max(100).allow(null).optional();

const paymentSchema = Joi.object({
  status: str(50),
  total_collected_amount: str(50),
  razorpay_amount: str(50),
  razorpay_payment_id: str(100),
  razorpay_order_id: str(100),
  customer_wallet_amount: str(50),
  sponsor_wallet_amount: str(50),
  promotional_wallet_amount: str(50),
  cod_amount: str(50),
  h_points_amount: str(50),
  refunded_amount: str(50),
  captured_at: str(50),
  refunded_at: str(50),
}).allow(null).optional();

const orderItemSchema = Joi.object({
  name: str(255),
  quantity: num(),
  mrp: num(),
  offered_price: num(),
  product_id: str(100),
});

const splitDetailsSchema = Joi.object({
  is_splitted: Joi.boolean().allow(null).optional(),
  parent_order: str(100),
  sub_orders: strList(100),
}).allow(null).optional();

// body of POST /api/across-assist/appointment-confirmation, sent on to Across Assist GetAppointmentConfirmation
const appointmentConfirmationSchema = Joi.object({
  booking_id: Joi.string().trim().max(100).required(),
  appointment_id: Joi.string().trim().max(100).required(),
  customer_id: str(100),
  customer_name: str(255),
  mobile_number: str(20),
  api_customer_id: str(100),
  appointment_date_time: str(50),
  event_timestamp: num(),
  booking_source: str(100),
  service_type: str(100),
  status: str(100),
  status_text: str(255),
  comment: str(2000),
  provider_id: num(),
  provider_name: str(255),
  provider_branch: str(255),
  provider_address: str(1000),
  type: str(100),
  vendorType: str(100),
  payment: paymentSchema,
  voucher_api_url: str(1000),
  phlebo_name: str(255),
  phlebo_number: str(20),
  reports: strList(1000),
  doctor_id: str(100),
  doctor_name: str(255),
  doctor_specialities: strList(255),
  doctor_gender: str(20),
  doctor_qualification: str(255),
  doctor_languages: strList(100),
  doctor_experience: num(),
  summary: str(5000),
  doctor_prescriptions: strList(1000),
  latitude: str(50),
  longitude: str(50),
  hospital_name: str(255),
  hospital_location: str(255),
  hospital_address: str(1000),
  meeting_link: str(1000),
  order_id: str(100),
  ordered_for_name: str(255),
  order_type: str(100),
  vendor_name: str(255),
  status_description: str(1000),
  partner_status: str(100),
  order_items: Joi.array().items(orderItemSchema).max(200).allow(null).optional(),
  total_amount: num(),
  total_selling_price: num(),
  total_discount: num(),
  tracking_url: str(1000),
  tracking_partner: str(255),
  tracking_number: str(100),
  eta_from: str(50),
  eta_to: str(50),
  address: str(1000),
  city: str(100),
  pincode: str(20),
  state: str(100),
  split_details: splitDetailsSchema,
});

module.exports = { appointmentConfirmationSchema };
