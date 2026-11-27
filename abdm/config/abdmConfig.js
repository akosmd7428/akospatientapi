const {
  ABDM_GATEWAY_URL,
  ABDM_ABHA_URL,
  ABDM_CLIENT_ID,
  ABDM_CLIENT_SECRET,
  ABDM_BRIDGE_URL,
  ABDM_BRIDGE_ID,
  ABDM_HFR_ID,
  ABDM_HIP_ID,
  ABDM_HPR_URL,
  ABDM_HIECM_URL
} = require('../../config/secret');

module.exports = {
  // Gateway base URL for M2 HIP operations (token, link care context)
  gatewayUrl: ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/api/hiecm/gateway',
  // HIE-CM API base URL for M3 HIU operations (consent, health-info) — no /gateway suffix
  hiecmUrl: ABDM_HIECM_URL || 'https://dev.abdm.gov.in/api/hiecm',
  // ABHA service (M1 - enrollment, login, profile)
  abhaUrl: ABDM_ABHA_URL || 'https://abhasbx.abdm.gov.in/abha/api',
  // HPR service (M4 - HP-ID creation for healthcare professionals)
  // New V4 sandbox URL — old hpridsbx.abdm.gov.in is no longer reachable
  hprUrl: ABDM_HPR_URL || 'https://apihspsbx.abdm.gov.in/v4/int',
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
  // M2 endpoints on HIE-CM (all use hiecmUrl base, not gatewayUrl)
  m2: {
    generateToken:    '/v3/token/generate-token',
    linkCareContext:  '/hip/v3/link/carecontext',
    onDiscover:       '/user-initiated-linking/v3/patient/care-context/on-discover',
    onLinkInit:       '/user-initiated-linking/v3/link/care-context/on-init',
    onLinkConfirm:    '/user-initiated-linking/v3/link/care-context/on-confirm',
    consentOnNotify:  '/consent/v3/request/hip/on-notify',
    healthInfoOnReq:  '/data-flow/v3/health-information/hip/on-request',
    healthInfoNotify: '/data-flow/v3/health-information/notify',
    smsNotify:        '/v3/hip/patient/sms/notify2',
  },
  // M3 endpoints on Gateway
  m3: {
    consentInit: '/consent/v3/request/init',
    consentStatus: '/consent/v3/request/status',
    consentFetch: '/consent/v3/fetch',
    healthInfoRequest: '/health-information/v3/request',
  },
  // M4 endpoints — NHPR V4 API (https://apihspsbx.abdm.gov.in/v4/int)
  m4: {
    bridgeUpdate: '/v1/bridges/MutipleHRPAddUpdateServices',
    // HP-ID Registration: link-based Aadhaar flow (V4)
    // Step 1: generate ABDM-hosted Aadhaar auth link (no encrypted Aadhaar needed)
    hprGenerateLink: '/aadhaar/generateLink',
    // Step 2: poll until user completes OTP on ABDM's page
    hprIsAuthenticated: '/aadhaar/isAuthenticated',
    // Step 3: get Aadhaar demographic data after auth
    hprVerifyOtp: '/v2/registration/aadhaar/verifyOTP',
    // Step 4: check if HP-ID already registered for this Aadhaar
    hprCheckExist: '/v1/registration/aadhaar/checkHpIdAccountExist',
    // Step 5: get HP-ID address suggestions
    hprIdSuggestion: '/v1/registration/aadhaar/hpid/suggestion',
    // Step 6: create HP-ID
    hprCreateId: '/v2/registration/aadhaar/createHprIdWithPreVerified',
    // Profile
    hprProfile: '/v1/account/information',
    // Auth (for existing HP-ID login — separate from registration)
    hprAuthInit: '/api/v1/auth/init',
    hprAuthConfirm: '/api/v1/auth/confirmWithAadhaarOtp',
  },
  // Certificate cache TTL in ms (1 hour)
  certCacheTTL: 60 * 60 * 1000,
};
