const AuthController = require('../controllers/authController');
const PatientService = require('../services/patientService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

const CLIENT_ID_HEADER = 'x-client-id';
const CLIENT_SECRET_HEADER = 'x-client-secret';

// the api client sends its client id and secret in the headers (or client_id / client_secret in the body),
// they are checked against the company table (Laravel encrypted secret, api access and ip whitelist) before the
// request goes on, the request body is left untouched
const getCredentials = (req) => {
    const body = req.body || {};
    if (req.header(CLIENT_ID_HEADER) || req.header(CLIENT_SECRET_HEADER)) {
        return { clientId: req.header(CLIENT_ID_HEADER), clientSecret: req.header(CLIENT_SECRET_HEADER) };
    }
    // with parent_client_id the secret in the body belongs to the parent company
    return { clientId: body.parent_client_id || body.client_id, clientSecret: body.client_secret };
};

const clientAuth = async (req, res, next) => {
    try {
        const { clientId, clientSecret } = getCredentials(req);

        if (!clientId || !clientSecret) {
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, 'Client credentials are missing');
        }

        const companyDetails = await PatientService.getCompanyDetails(clientId);
        if (!companyDetails[0]) {
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_invalid_client);
        }

        const clientCheck = AuthController.validateSsoClient(companyDetails[0], clientSecret, CommonHelper.getClientIp(req));
        if (!clientCheck.valid) {
            return CommonHelper.sendErrorUnencrypt(res, clientCheck.statusCode, clientCheck.message);
        }

        const { client_secret, ...company } = companyDetails[0];
        req.apiClient = company;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = clientAuth;
