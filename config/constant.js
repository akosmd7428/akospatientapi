const STATUS_CODE = {
    HTTP_200_OK: 200,
    HTTP_201_CREATED: 201,
    HTTP_400_BAD_REQUEST: 400,
    HTTP_500_INTERNAL_SERVER_ERROR: 500,
    HTTP_404_NOT_FOUND: 404,
    HTTP_401_UNAUTHORIZED: 401,
    HTTP_403_FORBIDDEN: 403,
    HTTP_203_SUCCESS: 203,
    HTTP_402_PAYMENT_REQUIRED: 402,
};

const BEHAVIOURAL_HEALTH = {
    STRING_BEGIN: "The scores you have given suggest are ",
    STRING_END: " to be suffering with depression and report many of the common symptoms."
};

// sso client login "redirect_page" values and the patient frontend path they open (the base url is PATIENT_FRONTEND_URL)
const SSO_REDIRECT_PAGES = {
    'lab booking': '/LabTests',
    'talk to doctor': '/TalkToDoctor',
};

// opened when no redirect_page is sent
const SSO_DEFAULT_REDIRECT_PATH = '/dashboard';

module.exports = { STATUS_CODE, BEHAVIOURAL_HEALTH, SSO_REDIRECT_PAGES, SSO_DEFAULT_REDIRECT_PATH };
