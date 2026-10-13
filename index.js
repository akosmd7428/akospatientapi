require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http'); // For creating an HTTP server
const { sequelizeDB1 } = require('./config/sequelize');
const authRoutes = require('./routes/authRoutes');
const forgotPasswordRoutes = require('./routes/forgotPasswordRoutes');
const patientProfileRoutes = require('./routes/patientProfileRoutes');
const helpRoutes = require('./routes/helpRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const patientAssessmentRoutes = require('./routes/patientAssessmentRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientCareTeamRoutes = require('./routes/patientCareTeamRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const patientFolderRoutes = require('./routes/patientFolderRoutes');
const dataRoutes = require('./routes/dataRoutes');
const labTestRoutes = require('./routes/labTestRoutes');
const carePlanRoutes = require('./routes/carePlanRoutes');
const opentokRoutes = require('./routes/opentokRoutes');
const careNavigatorRoutes = require('./routes/careNavigatorRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const chatRoutes = require('./routes/chatRoutes');
const errorHandler = require('./middleware/errorHandler');
const routeLogger = require('./middleware/routeLogger');
const rateLimit = require('express-rate-limit');
const hrRoutes = require('./routes/hrRoutes');
const vitalMonitoringRoutes = require('./routes/vitalMonitoringRoutes');
const migrationRoutes = require('./routes/migrationRoutes');
const connectAccessRoutes = require('./routes/connectAccessRoutes');
const portalModuleRoutes = require('./routes/portalModuleRoutes');
const initSocket = require('./socket');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const httpServer = http.createServer(app);

// the api runs behind nginx, trust its X-Forwarded-For so rate limits are per client and not per proxy
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' })); // base64 uploads go through json bodies
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// allowed browser origins, comma separated in CORS_ORIGINS
const DEFAULT_CORS_ORIGINS = 'https://carenavigator.akosmd.in,https://360.akosmd.in,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005';
const corsOptions = {
  origin: (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS).split(',').map(origin => origin.trim()).filter(Boolean),
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization', 'role', 'companyId', 'x-sync-api-key'],
};

app.use(cors(corsOptions));

// Define the rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// login, otp and code endpoints are brute force targets, keep them on a much tighter budget
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all API routes
app.use('/api', apiLimiter);
app.use([
  '/api/auth/login',
  '/api/patient/details',
  '/api/auth/verify-email-token',
  '/api/auth/sso-client-login',
  '/api/auth/sso-verify-code',
  '/api/auth/external-signup',
  '/api/forgot-password',
  '/api/connect-access/verify-code',
  '/api/careNavigator/login',
  '/api/labs/verify-call-coupon',
], authLimiter);

// Apply route logger middleware to log all API route accesses
app.use(routeLogger);

app.use('/api/auth', authRoutes);
app.use('/api/forgot-password', forgotPasswordRoutes);
app.use('/api/patient', patientProfileRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/patient_assessments', patientAssessmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/care-team', patientCareTeamRoutes);
app.use('/api/appointment', appointmentRoutes);
app.use('/api/document', patientFolderRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/labs', labTestRoutes);
app.use('/api/care', carePlanRoutes);
app.use('/api/opentok', opentokRoutes);
app.use('/api', prescriptionRoutes);
app.use('/api/notify', notificationRoutes);
app.use('/api/careNavigator', careNavigatorRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/vital-monitoring', vitalMonitoringRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/connect-access', connectAccessRoutes);
app.use('/api/portal-modules', portalModuleRoutes);

// uploaded files, served as downloads so an uploaded html/svg can never run in the api origin
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, filePath) => {
    if (!/\.(png|jpe?g|gif|webp|pdf)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
  },
}));

// Error handling middleware (always at the end), logs the error and returns a generic response
app.use(errorHandler);

sequelizeDB1.sync()
  .then(() => {
    console.log('Database synced');
    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => console.error('Unable to sync database:', err));

initSocket(httpServer);
