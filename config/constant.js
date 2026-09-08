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

module.exports = { STATUS_CODE, BEHAVIOURAL_HEALTH };
