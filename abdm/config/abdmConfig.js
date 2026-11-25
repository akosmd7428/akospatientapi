const {
  ABDM_GATEWAY_URL,
  ABDM_ABHA_URL,
  ABDM_CLIENT_ID,
  ABDM_CLIENT_SECRET,
  ABDM_BRIDGE_URL,
  ABDM_BRIDGE_ID,
  ABDM_HFR_ID,
  ABDM_HIP_ID
} = require('../../config/secret');

module.exports = {
  // Gateway (token generation, M2/M3 callbacks)
  gatewayUrl: ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/api/hiecm/gateway',
  // ABHA service (M1 - enrollment, login, profile)
  abhaUrl: ABDM_ABHA_URL || 'https://abhasbx.abdm.gov.in/abha/api',
  clientId: ABDM_CLIENT_ID,
  clientSecret: ABDM_CLIENT_SECRET,
  bridgeUrl: ABDM_BRIDGE_URL,
  bridgeId: ABDM_BRIDGE_ID,
  hfrId: ABDM_HFR_ID,
  hipId: ABDM_HIP_ID,
  // X-CM-ID for sandbox
  cmId: 'sbx',
  // M1 endpoints on ABHA service (https://abhasbx.abdm.gov.in/abha/api)
  m1: {
    // Enrollment
    requestOtp: '/v3/enrollment/request/otp',
    enrolByAadhaar: '/v3/enrollment/enrol/byAadhaar',
    authByAbdm: '/v3/enrollment/auth/byAbdm',
    addressSuggestion: '/v3/enrollment/enrol/suggestion',
    createAddress: '/v3/enrollment/enrol/abha-address',
    // Certificate
    publicCertificate: '/v3/profile/public/certificate',
    // Login (profile flow: ABHA number, Aadhaar, mobile)
    loginRequestOtp: '/v3/profile/login/request/otp',
    loginVerify: '/v3/profile/login/verify',
    verifyUser: '/v3/profile/login/verify/user',
    // PHR login (ABHA address flow)
    phrLoginRequestOtp: '/v3/phr/web/login/abha/request/otp',
    phrLoginVerify: '/v3/phr/web/login/abha/verify',
    // Profile (requires X-token)
    profile: '/v3/profile/account',
    abhaCard: '/v3/profile/account/abha-card',
    qrCode: '/v3/profile/account/qrCode',
    downloadCard: '/v3/profile/account/download-abha-card',
    refreshToken: '/v3/profile/account/request/token',
  },
  // M2 endpoints on Gateway
  m2: {
    generateToken: '/v3/hip/generateToken',
    linkCareContext: '/v3/hip/link/carecontext',
    smsNotify: '/v3/hip/patient/sms/notify2',
  },
  // M3 endpoints on Gateway
  m3: {
    consentInit: '/consent/v3/request/init',
    consentStatus: '/consent/v3/request/status',
    consentFetch: '/consent/v3/fetch',
    healthInfoRequest: '/health-information/v3/request',
  },
  // M4 endpoints
  m4: {
    facilitySearch: '/facilitymanagement/v1.5/facility/search',
    bridgeUpdate: '/v1/bridges/MutipleHRPAddUpdateServices',
  },
  // Certificate cache TTL in ms (1 hour)
  certCacheTTL: 60 * 60 * 1000,
};
