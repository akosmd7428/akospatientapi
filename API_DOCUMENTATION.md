# Patient Portal API — Documentation

REST + WebSocket API for the AKOS MD patient portal. It serves patients, HR
administrators, and care navigators, covering authentication, profiles,
appointments, tele‑consults, lab tests, prescriptions, assessments, chat,
notifications, and vital monitoring.

- **Package:** `akosmd_patient` v1.0.0
- **Stack:** Node.js · Express 4 · Sequelize (MySQL) · Socket.IO · JWT
- **Entry point:** [index.js](index.js)
- **Default port:** `3001` (override with `PORT`)

---

## Table of contents

1. [Base URL](#base-url)
2. [Conventions](#conventions)
3. [Payload encryption](#payload-encryption)
4. [Authentication](#authentication)
5. [Standard response format](#standard-response-format)
6. [Rate limiting & CORS](#rate-limiting--cors)
7. [REST endpoints](#rest-endpoints)
   - [Auth](#auth--apiauth)
   - [Forgot password](#forgot-password--apiforgot-password)
   - [Patient profile](#patient-profile--apipatient)
   - [Help](#help--apihelp)
   - [Assessments](#assessments--apiassessments)
   - [Patient assessments](#patient-assessments--apipatient_assessments)
   - [Doctors](#doctors--apidoctors)
   - [Care team](#care-team--apicare-team)
   - [Appointments](#appointments--apiappointment)
   - [Documents / folders](#documents--apidocument)
   - [Data / lookups](#data--apidata)
   - [Lab tests](#lab-tests--apilabs)
   - [Care plan](#care-plan--apicare)
   - [OpenTok (video)](#opentok-video--apiopentok)
   - [Prescriptions](#prescriptions--api)
   - [Notifications](#notifications--apinotify)
   - [Care navigator](#care-navigator--apicarenavigator)
   - [Chat](#chat--apichat)
   - [HR](#hr--apihr)
   - [Vital monitoring](#vital-monitoring--apivital-monitoring)
   - [Migration / sync](#migration--apimigration)
8. [Detailed request & response reference](#detailed-request--response-reference)
9. [WebSocket (Socket.IO) events](#websocket-socketio-events)
10. [Status codes](#status-codes)

---

## Base URL

```
http://<host>:3001/api
```

All REST endpoints below are relative to `/api`. Static assets are served from
`/assets`.

---

## Conventions

- **Content-Type:** `application/json` for all request bodies.
- Path parameters are shown as `:param`.
- Every route is prefixed with the module mount point (e.g. `/api/auth/login`).
- Most routes require both a **JWT** (`Authorization` header) and an
  **encrypted payload** (see below).

---

## Payload encryption

Nearly every route is wrapped in the `validateDataEncryption()` middleware
([middleware/validateDataEncryption.js](middleware/validateDataEncryption.js)).
The API expects request bodies, query strings, and route params (where used)
to be **AES‑256‑CBC encrypted**, and it returns encrypted responses the same
way.

- **Algorithm:** `aes-256-cbc`
- **Envelope shape (request & response):**

```json
{
  "encryptedData": "<hex ciphertext>",
  "IV": "<hex initialization vector>"
}
```

The server decrypts `encryptedData` using the provided `IV`, parses the result
as JSON, and places it into `req.body` / `req.query` / `req.params`. Successful
responses are the encrypted form of the [standard response object](#standard-response-format).

> **Note:** A handful of routes (e.g. `/api/auth/encrypt`, `/api/auth/decrypt`,
> the migration/sync routes, and OpenTok token routes) do **not** apply the
> encryption middleware and accept/return plain JSON. These are noted per
> endpoint.

Helper endpoints for testing:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/encrypt` | Encrypt a sample JSON payload (plain in/out). |
| POST | `/api/auth/decrypt` | Decrypt an `{ encryptedData, IV }` payload. |

---

## Authentication

Four auth schemes are used depending on the module:

| Scheme | Middleware | Applies to |
|--------|-----------|------------|
| Patient JWT | `jwtAuth` | Patient‑facing modules |
| Care navigator JWT | `jwtAuthCareNavigator` | `/api/careNavigator/*` |
| HR JWT | `jwtAuthHr` | `/api/hr/*` |
| Sync API key | `syncApiKeyAuth` | `/api/migration/*` |

### JWT (patient / care navigator / HR)

Send the token as a Bearer token, plus a `role` header that **must match** the
`role` claim inside the token ([middleware/jwtAuth.js](middleware/jwtAuth.js)):

```
Authorization: Bearer <jwt>
role: <role-from-token>
companyId: <optional company id>
```

- Missing token → `401` `"Access denied. No token provided"`
- Invalid token or mismatched `role` header → `401` `"Invalid token"`

### Sync API key (migration)

Send a shared secret header ([middleware/syncApiKeyAuth.js](middleware/syncApiKeyAuth.js)):

```
x-sync-api-key: <SYNC_API_KEY>
```

Compared in constant time against the `SYNC_API_KEY` env var. Missing/invalid →
`401`; unconfigured server → `500`.

---

## Standard response format

Before encryption, both success and error responses use this envelope
([helpers/commonHelper.js](helpers/commonHelper.js)):

**Success**
```json
{
  "success": true,
  "message": "Human readable message",
  "data": { },
  "...": "optional additional fields"
}
```

**Error**
```json
{
  "success": false,
  "message": "Human readable message",
  "errors": []
}
```

For encrypted routes the above object is serialized and returned as
`{ encryptedData, IV }`.

> **Important convention — the `data` field is often literally `true`.**
> Most controllers call `sendSuccess(res, true, statusCode, message, { payloadKey })`.
> The second argument becomes the `data` field, and the real payload is **spread at
> the top level** under its own named key (e.g. `states`, `token`, `patientProfileDetails`,
> `assessments`). So a typical decrypted success body looks like:
>
> ```json
> { "success": true, "message": "Data fetched successfully", "data": true, "states": [ ... ] }
> ```
>
> A few endpoints instead pass the real data as the second argument, in which case
> `data` holds the actual object/array. Both forms are shown accurately in the
> [detailed reference](#detailed-request--response-reference) below.

---

## Rate limiting & CORS

- **Rate limit:** 1000 requests per IP per 15‑minute window on all `/api`
  routes. Exceeding it returns `429` with a plain‑text message. Standard
  `RateLimit-*` headers are returned.
- **CORS allowed origins:** `https://carenavigator.akosmd.in`,
  `https://360.akosmd.in`, and `http://localhost:3000‑3005`.
- **Allowed methods:** `GET, HEAD, PUT, PATCH, POST, DELETE`
- **Allowed headers:** `Content-Type, Authorization, role, companyId`

---

## REST endpoints

Legend — **Auth**: 🔒 JWT required · 🔑 sync API key · 🌐 none.
All routes are encrypted unless marked *(plain)*.

### Auth — `/api/auth`
[routes/authRoutes.js](routes/authRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | 🌐 | Register a new patient (validated). |
| POST | `/login` | 🌐 | Patient login → returns JWT. |
| POST | `/encrypt` *(plain)* | 🌐 | Encrypt a sample payload (utility). |
| POST | `/decrypt` *(plain)* | 🌐 | Decrypt a sample payload (utility). |
| GET | `/getquery` | 🌐 | Return a query string (utility). |
| POST | `/ssologin` | 🌐 | Single sign‑on login. |
| POST | `/sso-client-login` *(plain)* | 🌐 | SSO login for an API client — validated by `client_id` / `client_secret`. |
| POST | `/external-signup-old` | 🌐 | Legacy external signup. |
| POST | `/external-signup` | 🌐 | External signup — creates user pending email verification. |
| GET | `/verify-email-token` | 🌐 | Verify a patient's email token. |

### Forgot password — `/api/forgot-password`
[routes/forgotPasswordRoutes.js](routes/forgotPasswordRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/send-otp` | 🌐 | Send a password‑reset OTP to email. |
| POST | `/verify-otp` | 🌐 | Verify the OTP. |
| POST | `/change-password` | 🌐 | Change password after OTP verification. |
| POST | `/resend-otp` | 🌐 | Resend the OTP. |
| POST | `/change_password` | 🔒 | Change password for an authenticated user. |

### Patient profile — `/api/patient`
[routes/patientProfileRoutes.js](routes/patientProfileRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile` | 🔒 | Get the logged‑in patient's profile. |
| POST | `/profile` | 🔒 | Create or update profile. |
| GET | `/details/:patientEmail` | 🌐 | Get patient details by email. |
| POST | `/updateProfile` | 🔒 | Update profile. |
| GET | `/patientSignIn` | 🔒 | Patient sign‑in details. |
| POST | `/notes` | 🔒 | Add/update patient notes. |

### Help — `/api/help`
[routes/helpRoutes.js](routes/helpRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/faq` | 🔒 | Fetch help FAQs. |
| POST | `/send-email` | 🔒 | Send a support email (validated). |

### Assessments — `/api/assessments`
[routes/assessmentRoutes.js](routes/assessmentRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/get` | 🔒 | List available assessments. |
| GET | `/detail/:assessmentId` | 🔒 | Assessment details. |
| GET | `/completed` | 🔒 | Assessments taken by the patient. |
| GET | `/completedDetails/:assessmentId` | 🔒 | Details of a completed assessment. |
| POST | `/createBulk` | 🔒 | Bulk‑create patient assessment answers. |
| GET | `/behaviouralHealth/:assessmentId` | 🔒 | Behavioural‑health assessment details. |
| POST | `/behaviouralHealth` | 🔒 | Submit behavioural‑health assessment. |

### Patient assessments — `/api/patient_assessments`
[routes/patientAssessmentRoutes.js](routes/patientAssessmentRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | 🔒 | List the patient's assessments. |
| POST | `/` | 🔒 | Create a patient assessment (validated). |
| POST | `/bulk` | 🔒 | Bulk‑create patient assessments. |

### Doctors — `/api/doctors`
[routes/doctorRoutes.js](routes/doctorRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/:employer_id` | 🔒 | List doctors for an employer. |
| GET | `/slot/:doctorId` | 🔒 | Get a doctor's availability slots. |

### Care team — `/api/care-team`
[routes/patientCareTeamRoutes.js](routes/patientCareTeamRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/get` | 🔒 | Get the patient's care team. |
| POST | `/create` | 🔒 | Add doctors to the care team (validated). |

### Appointments — `/api/appointment`
[routes/appointmentRoutes.js](routes/appointmentRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/book` | 🔒 | Book an appointment (validated). |
| GET | `/get/:status` | 🔒 | List appointments by status. |
| GET | `/my-medicines` | 🔒 | List the patient's medicines. |
| POST | `/reschedule` | 🔒 | Reschedule an appointment (validated). |
| POST | `/cancel` | 🔒 | Cancel an appointment (validated). |
| GET | `/details/:appointmentId` | 🔒 | Appointment details. |
| GET | `/medical-records/:companyId` | 🔒 | Medical records for a company. |
| GET | `/talkToDoctor` | 🔒 | Talk‑to‑doctor (instant consult) info. |
| GET | `/dashboard` | 🔒 | Appointment dashboard summary. |
| POST | `/fetchCallDetails` | 🔒 | Fetch video/voice call details. |
| POST | `/check-appointment-status` | 🔒 | Check appointment availability/status (validated). |

### Documents — `/api/document`
[routes/patientFolderRoutes.js](routes/patientFolderRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/folders` | 🔒 | List document folders. |
| GET | `/files` | 🔒 | List files. |

### Data — `/api/data`
[routes/dataRoutes.js](routes/dataRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/patient/:type` | 🔒 | Get patient‑related data by type. |
| GET | `/states` | 🌐 | List states. |
| GET | `/cities` | 🌐 | List cities. |
| POST | `/upload` | 🔒 | Upload a file. |
| POST | `/getTalkToDoctorCallListApi` | 🔒 | Get talk‑to‑doctor call queue. |
| GET | `/states-hr` | 🌐 | List states (HR view). |
| GET | `/cities-hr` | 🌐 | List cities (HR view). |
| GET | `/states-carenavigator` | 🌐 | List states (care‑navigator view). |
| GET | `/cities-carenavigator` | 🌐 | List cities (care‑navigator view). |

### Lab tests — `/api/labs`
[routes/labTestRoutes.js](routes/labTestRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/packages-and-tests` | 🔒 | List lab packages and tests. |
| POST | `/upload` | 🔒 | Upload a prescription (validated). |
| POST | `/addToCart` | 🔒 | Add a test/package to cart (validated). |
| GET | `/cities` | 🔒 | Active lab cities. |
| POST | `/cart/details` | 🔒 | Cart details by patient. |
| POST | `/cart/lab-details` | 🔒 | Lab details for a cart. |
| POST | `/branches` | 🔒 | Lab branches by lab & city. |
| POST | `/tests-and-packages` | 🔒 | Tests & packages by lab. |
| POST | `/test-or-package-details` | 🔒 | Single test/package details. |
| DELETE | `/remove/:cartId` | 🔒 | Remove a cart item. |
| GET | `/prescription/:patientId` | 🔒 | Get prescription URL. |
| DELETE | `/prescription/:prescriptionId` | 🔒 | Delete a prescription. |
| POST | `/order` | 🔒 | Create a lab order. |
| GET | `/orders/:orderId` | 🔒 | Get lab orders for a patient. |
| PUT | `/order` | 🌐 | Update a lab order. |
| GET | `/list/:patientId` | 🌐 | List lab orders. |
| DELETE | `/cartRemove/:cartId` | 🔒 | Remove a cart. |
| PUT | `/cart` | 🔒 | Update the lab id on a cart. |
| GET | `/labDetail/:cartId` | 🔒 | Lab detail for a cart. |
| POST | `/purchaseLabTest` | 🔒 | Purchase a lab test (web). |
| POST | `/purchaseLabTestMobile` | 🔒 | Purchase a lab test (mobile). |
| POST | `/labtestnotification` | 🔒 | Lab test notification. |
| POST | `/re-schedule-lab` | 🔒 | Reschedule a lab booking. |
| POST | `/paymentStatus` | 🔒 | Payment status (web). |
| POST | `/paymentStatusMobile` | 🌐 | Payment status (mobile). |
| PUT | `/updateAddress` | 🔒 | Update lab test address. |
| GET | `/getLabTestAddress` | 🔒 | Get lab test address. |
| GET | `/getRedcliffAloc` | 🌐 | Redcliffe ALOC number. |
| POST | `/getRedcliffSlot` | 🌐 | Redcliffe booking slots. |
| POST | `/createRedcliffBooking` | 🌐 | Create Redcliffe booking. |
| POST | `/redCliffReport` | 🌐 | Redcliffe report webhook. |
| POST | `/fetchRedcliffReport` | 🌐 | Fetch Redcliffe report. |
| GET | `/check-payment-status` | 🔒 | Check call payment status. |
| POST | `/create-payment-call` | 🔒 | Create a payment for a call. |
| POST | `/verify-call-coupon` | 🔒 | Verify a call coupon. |
| POST | `/paymentStatusCallCheck` | 🔒 | Check call payment status. |
| POST | `/cart/unpaid-lab-details` | 🔒 | Unpaid lab details for an item. |

### Care plan — `/api/care`
[routes/carePlanRoutes.js](routes/carePlanRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plan` | 🔒 | Get care plan details. |

### OpenTok (video) — `/api/opentok`
[routes/opentokRoutes.js](routes/opentokRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/generate-session` *(plain)* | 🌐 | Generate an OpenTok session. |
| GET | `/generate-token` *(plain)* | 🌐 | Generate an OpenTok token. |

### Prescriptions — `/api`
[routes/prescriptionRoutes.js](routes/prescriptionRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/prescription/detail` | 🌐 | Save prescription details. |
| GET | `/prescription` | 🌐 | Get prescription detail. |
| GET | `/medicines` | 🌐 | Get medicines. |

### Notifications — `/api/notify`
[routes/notificationRoutes.js](routes/notificationRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/notifications` | 🔒 | Create a notification. |
| GET | `/notifications` | 🔒 | List notifications. |
| POST | `/removeNotification` | 🔒 | Remove a notification. |
| POST | `/updateReadNotification` | 🔒 | Mark a notification as read. |

### Care navigator — `/api/careNavigator`
[routes/careNavigatorRoutes.js](routes/careNavigatorRoutes.js) — all routes use `jwtAuthCareNavigator`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | 🔒(CN) | Care navigator login (validated). |
| GET | `/profile` | 🔒(CN) | Get profile. |
| POST | `/profile` | 🔒(CN) | Create/update profile. |
| GET | `/appointments` | 🔒(CN) | List appointments. |
| POST | `/reschedule` | 🔒(CN) | Reschedule appointment. |
| POST | `/cancel` | 🔒(CN) | Cancel appointment. |
| POST | `/approve` | 🔒(CN) | Approve appointment. |
| GET | `/patients` | 🔒(CN) | List all patients. |
| GET | `/myPatients` | 🔒(CN) | List assigned patients. |
| GET | `/labTests` | 🔒(CN) | List lab tests. |
| GET | `/dashboard` | 🔒(CN) | Dashboard summary. |
| GET | `/prescriptions` | 🔒(CN) | List prescriptions. |
| POST | `/updateLabOrder` | 🔒(CN) | Update a lab order. |
| POST | `/uploadLabReport` | 🔒(CN) | Upload a lab report. |
| GET | `/getPackages` | 🔒(CN) | List packages. |
| POST | `/updateAppointment` | 🔒(CN) | Update an appointment. |
| POST | `/send-email` | 🔒(CN) | Send an email. |
| GET | `/orders/:orderId` | 🔒(CN) | Lab orders for a patient. |
| POST | `/uploadPrescription` | 🔒(CN) | Upload a prescription. |
| GET | `/preemployeelabTests` | 🔒(CN) | Pre‑employment lab tests. |
| POST | `/updatePreLabReport` | 🔒(CN) | Update a pre‑employment lab report. |

### Chat — `/api/chat`
[routes/chatRoutes.js](routes/chatRoutes.js) — REST companions to the Socket.IO chat.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/initiate-chat` | 🌐 | Initiate a chat. |
| POST | `/send-message` | 🌐 | Send a message. |
| GET | `/chat-history` | 🌐 | Get chat history. |
| GET | `/user-status` | 🌐 | Get a user's online status. |
| POST | `/update-user-status` | 🌐 | Update a user's status. |
| GET | `/chat-list` | 🌐 | Get chat list. |
| POST | `/update-read-status` | 🌐 | Update read status. |
| GET | `/searchList` | 🌐 | Search chat list. |

### HR — `/api/hr`
[routes/hrRoutes.js](routes/hrRoutes.js) — all routes use `jwtAuthHr`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile` | 🔒(HR) | Get HR profile. |
| POST | `/profile` | 🔒(HR) | Create/update HR profile. |
| POST | `/add-pre-employee` | 🔒(HR) | Add a pre‑employee (validated). |
| GET | `/preEmployee` | 🔒(HR) | List pre‑employees. |
| GET | `/assesmentHra` | 🔒(HR) | Company HRA assessments. |
| GET | `/doctorConsultancy` | 🔒(HR) | Employees who took a doctor call. |
| GET | `/healthRisk` | 🔒(HR) | Cardio / health‑risk records. |
| GET | `/manageEmployee` | 🔒(HR) | Employee details. |
| POST | `/disableEnableEmployee` | 🔒(HR) | Enable/disable an employee. |
| POST | `/addEmployee` | 🔒(HR) | Add an employee patient. |
| POST | `/updateHrProfile` | 🔒(HR) | Update HR profile. |
| GET | `/employeeEngagement` | 🔒(HR) | Employee engagement metrics. |
| POST | `/sendReminder` | 🔒(HR) | Send a reminder. |
| POST | `/send-email` | 🔒(HR) | Send an email. |
| GET | `/user-module` | 🔒(HR) | Get accessible user modules. |

### Vital monitoring — `/api/vital-monitoring`
[routes/vitalMonitoringRoutes.js](routes/vitalMonitoringRoutes.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/get-device` | 🔒 | Get device info. |
| GET | `/get-device-monitoring` | 🔒 | Get device monitoring data. |
| POST | `/post-vital-monitoring` | 🔒 | Post a vital‑monitoring reading. |
| GET | `/get-detail-monitoring` | 🔒 | Detailed monitoring data. |
| GET | `/view-device-comment` | 🔒 | View device comments. |
| POST | `/post-device-comment` | 🔒 | Post a device comment. |

### Migration — `/api/migration`
[routes/migrationRoutes.js](routes/migrationRoutes.js) — plain JSON, secured by `x-sync-api-key`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/corporate` | 🔑 | Migrate/sync corporate data. |
| POST | `/doctor` | 🔑 | Migrate/sync doctor data. |
| POST | `/package` | 🔑 | Migrate/sync package data. |
| POST | `/lab` | 🔑 | Migrate/sync lab data. |

---

## Detailed request & response reference

Concrete decrypted **request** payloads and **response** bodies for each endpoint,
extracted from the controllers/validators. All values are realistic samples. On the
wire, encrypted routes wrap both request and response in `{ encryptedData, IV }`
(see [Payload encryption](#payload-encryption)); the JSON shown here is the
**decrypted** form. Recall the [`data: true` convention](#standard-response-format).

### Auth

**POST /api/auth/register** — also validated by `registerSchema`.
```jsonc
// Request
{ "first_name": "John", "last_name": "Doe", "email": "john@example.com", "password": "Secret@123" }
// Response
{ "success": true, "message": "User registered successfully.", "data": true,
  "patient": { "id": 42, "email": "john@example.com", "first_name": "John", "last_name": "Doe" } }
```

**POST /api/auth/login** — also reads header `role` (`patient` | `careNavigator` | `hr`).
```jsonc
// Request
{ "email": "john@example.com", "password": "Secret@123" }
// Response
{ "success": true, "message": "User logged in successfully.", "data": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "userDetails": { "id": 42, "email": "john@example.com", "role": "patient" } }
```

**POST /api/auth/ssologin** — header `role`; returns same `{ token, userDetails }` as login.
```jsonc
// Request
{ "origin_company": "Parent Corp", "origin_company_address": "1 Main St", "company_name": "Acme Inc",
  "employee_name": "John Doe", "employee_email": "john@example.com", "employee_mobile": "9876543210",
  "company_address": "22 Market Rd" }
```

**POST /api/auth/sso-client-login** — SSO login for a trusted API client. Request and response are **plain JSON** (not encrypted). The patient is created on first call and logged in on every call.

`client_id` / `parent_client_id` are the `employer_id` values in `worksman_company_list`. When `parent_client_id` is sent, `client_secret`, `api_access` and the IP whitelist are checked **on the parent company**, and `client_id` must be the parent itself or one of its child companies (`parent_id` = parent's `id`). Without `parent_client_id` those same checks run on the `client_id` company. The IP whitelist is only enforced when the company's `api_ip_restriction` is `1`; entries in `api_ip_whitelist` may be separated by comma, semicolon, space or new line, and `*` allows any IP.

```jsonc
// Request
{ "parent_client_id": "513740", "client_id": "593402", "client_secret": "<client secret>",
  "email": "john@example.com", "mobile": "9876543210", "firstname": "John", "last_name": "Doe" }
// Response
{ "success": true, "message": "User logged in successfully.", "data": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "userDetails": [ { "loggedPatientId": 42, "email": "john@example.com", "companyId": 16 } ] }
```

| Status | Message | Cause |
|--------|---------|-------|
| 400 | Joi validation errors | missing/invalid field in the payload |
| 401 | `Invalid parent client id.` | `parent_client_id` does not match an active company |
| 401 | `Invalid client id.` | `client_id` does not match an active company |
| 401 | `Invalid client secret.` | `client_secret` does not match the company's stored secret |
| 401 | `The client id does not belong to the given parent client id.` | `client_id` is not a child of `parent_client_id` |
| 403 | `API access is not enabled for this client.` | company's `api_access` is not `1` |
| 403 | `Your IP address is not whitelisted for this client.` | caller IP missing from `api_ip_whitelist` while `api_ip_restriction` is `1` |
| 403 | `This user belongs to another client.` | the `email` already exists under a different company |

**POST /api/auth/external-signup** — sends a verification email; empty payload on success.
```jsonc
// Request
{ "employer_id": 7, "company_name": "Acme Inc", "employee_name": "John Doe",
  "employee_email": "john@example.com", "employee_mobile": "9876543210",
  "employee_password": "Secret@123", "company_address": "22 Market Rd" }
// Response
{ "success": true, "data": true,
  "message": "Your information has been submitted successfully. A verification link has been sent to your email inbox." }
```

**GET /api/auth/verify-email-token** — `?token=<jwt from email>`.
```jsonc
// Response
{ "success": true, "message": "User has been created successfully.", "data": true, "createdUserDetails": 42 }
```

**POST /api/auth/encrypt / /decrypt** — utilities. `/encrypt` echoes the body back encrypted; `/decrypt` takes `{ encryptedData, IV }` and returns the parsed object (plain JSON).

### Forgot password

**POST /api/forgot-password/send-otp** (and `/resend-otp`) — header `role` (`patient` | `careNavigator` | `dependent` | `hr`).
```jsonc
// Request
{ "email": "john@example.com" }
// Response
{ "success": true, "message": "OTP sent successfully", "data": true }
```

**POST /api/forgot-password/verify-otp**
```jsonc
// Request
{ "email": "john@example.com", "otp": "123456" }
// Response
{ "success": true, "message": "OTP verified successfully", "data": true }
```

**POST /api/forgot-password/change-password** (and `/change_password`)
```jsonc
// Request
{ "email": "john@example.com", "newPassword": "NewSecret@123" }
// Response
{ "success": true, "message": "Password changed successfully", "data": true }
```

### Patient profile

**GET /api/patient/profile** — no body; patient from JWT (`req.user.id`).
```jsonc
// Response (abridged)
{ "success": true, "message": "Patient profile retrieved successfully", "data": true,
  "patientProfileDetails": {
    "patientId": 1024, "parentId": 0, "fullname": "Amit Kumar", "email": "amit.kumar@akosmdtech.com",
    "phone": "9876543210", "dateofbirth": "1990-05-14", "gender": "Male", "city": "Bengaluru",
    "state": "Karnataka", "zip_code": "560001", "age": 36, "height": "175", "weight": "72",
    "bloodgroup": "O+", "emergency_contact": "9812345678", "profile_image": "https://.../profile.jpg",
    "aadharcard": "XXXX-XXXX-1234", "abha_id": "12-3456-7890-1234",
    "social_history": { "smoking": "Never", "drinking": "Past" },
    "symptoms": ["Headache"], "vaccinations": ["COVID-19"], "medications": ["Metformin 500mg"],
    "medical_allergies": ["Penicillin"], "health_problems": ["Hypertension"],
    "family_history": { "diabetes": "Yes", "relation_diabetes": "Father" },
    "dependents": [ { "patientId": 1090, "parentId": 1024, "fullname": "Riya Kumar", "age": 14 } ] } }
```

**POST /api/patient/profile** — create/update. Parent keyed by `req.user.id`, `age` must be > 17; dependents with `id` update, without `id` create.
```jsonc
// Request (abridged — full profile fields per createOrUpdatePatientSchema)
{ "fullname": "Amit Kumar", "email": "amit.kumar@akosmdtech.com", "phone": "9876543210",
  "dateofbirth": "1990-05-14", "gender": "Male", "city": "Bengaluru", "state": "Karnataka",
  "zip_code": "560001", "age": 36, "bloodgroup": "O+", "medications": ["Metformin 500mg"],
  "medical_allergies": ["Penicillin"], "health_problems": ["Hypertension"],
  "family_history": { "diabetes": "Yes", "relation_diabetes": "Father" },
  "dependents": [ { "id": 1090, "fullname": "Riya Kumar", "age": 14 } ] }
// Response
{ "success": true, "message": "Patient profile updated successfully", "data": true }
```

**GET /api/patient/details/:patientEmail** — returns success only for active accounts.
```jsonc
// Response
{ "success": true, "message": "Success", "data": true }
```

**POST /api/patient/updateProfile** — `patientId` required (from body); updates any `PatientDetail` columns present.
```jsonc
// Request
{ "patientId": 1024, "medications": ["Metformin 500mg", "Amlodipine 5mg"], "health_problems": ["Hypertension"] }
// Response
{ "success": true, "message": "Success", "data": true, "patientDetail": { "medications": ["Metformin 500mg", "Amlodipine 5mg"] } }
```

**GET /api/patient/patientSignIn** — patient from JWT.
```jsonc
// Response (abridged; userDetails = one row per connected company)
{ "success": true, "message": "User logged in successfully.", "data": true,
  "userDetails": [ { "loggedPatientId": 1024, "uniquePatientId": "482913", "first_name": "Amit",
    "last_name": "Kumar", "email": "amit.kumar@akosmdtech.com", "role": "Patient", "companyId": 57,
    "company_name": "Akos MD Tech", "isProfileCompleted": true } ] }
```

**POST /api/patient/notes** — both fields required.
```jsonc
// Request
{ "patientId": 1024, "notes": "Patient reports improved sleep. Follow up in 2 weeks." }
// Response
{ "success": true, "message": "Success", "data": true, "patientDetail": { "notes": "Patient reports improved sleep..." } }
```

### Prescriptions

**POST /api/prescription/detail** — `patientPrescriptionDetails.doctorEmail` required; `patientId: 0` = general record.
```jsonc
// Request
{ "patientPrescriptionDetails": { "patientId": 1024, "appointmentId": 3310, "doctorEmail": "dr.rao@akosmd.in",
    "patientName": "Amit Kumar", "diagnosis": "Essential hypertension", "chiefComplaints": "Headache, dizziness",
    "signature": "data:image/png;base64,iVBORw0KGgo..." },
  "medicineDetails": [ { "medicineName": "Amlodipine", "frequency": "1-0-1", "duration": "30 days",
    "drugForm": "Tablet", "strength": "5mg", "instructions": "After food" } ] }
// Response
{ "success": true, "message": "Success", "data": true }
```

**GET /api/prescription** — `?email=<doctor>&token=<patient email>&cid=<record id>`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Data fetched successfully", "data": true,
  "response": { "patientDetail": { "name": "Amit Kumar", "patientId": 1024 },
    "doctorDetail": { "id": 12, "name": "Dr. Rao", "speciality": "Cardiology", "reg_no": "KA-45678" },
    "prescriptionDetail": { "diagnosis": "Essential hypertension", "chief_complaints": "Headache, dizziness" } } }
```

### Assessments

**GET /api/assessments/get** — `?type=1` (filter).
```jsonc
// Response
{ "success": true, "message": "Assessments fetched successfully", "data": true,
  "assessments": [ { "id": 7, "assessmentName": "Health Risk Assessment", "assessmentType": "General", "totalLevels": 5 } ] }
```

**GET /api/assessments/detail/:assessmentId** — questions grouped by level.
```jsonc
// Response
{ "success": true, "message": "Assessment details fetched successfully", "data": true,
  "questions": [ { "level": 1, "levelName": "Physical Health", "questions": [
    { "questionId": 125, "questionText": "What is your systolic blood pressure?", "optionType": "radio",
      "options": [ { "optionId": 501, "optionText": "Below 120", "optionsValue": "1" } ] } ] } ] }
```

**GET /api/assessments/behaviouralHealth/:assessmentId** — flat question array (PHQ-style).
```jsonc
// Response
{ "success": true, "message": "Assessment details fetched successfully", "data": true,
  "questions": [ { "questionId": 210, "questionText": "Little interest or pleasure in doing things?",
    "options": [ { "optionId": 801, "optionText": "Not at all", "optionsValue": "0" } ] } ] }
```

**GET /api/assessments/completed** — distinct completed assessments (patient from JWT).
```jsonc
// Response
{ "success": true, "message": "Assessments fetched successfully", "data": true,
  "assessments": [ { "assessmentId": 7, "assessmentName": "Health Risk Assessment", "assessmentType": "General" } ] }
```

**GET /api/assessments/completedDetails/:assessmentId**
```jsonc
// Response (abridged)
{ "success": true, "message": "Assessments fetched successfully", "data": true,
  "assessments": [ { "id": 4521, "assessmentId": "7", "patientId": 1024, "assessmentName": "Health Risk Assessment",
    "assessmentTaken": [ { "completedDate": "16/07/2026", "response": { "percentage": 78, "result": "Low risk" } } ],
    "timeline": [ { "date": "16/07/2026", "percentage": 78, "maxRange": 100 } ] } ] }
```

**POST /api/assessments/createBulk** (and **/api/patient_assessments/bulk**) — bulk answers; scored via external API when the final level is submitted.
```jsonc
// Request
{ "assessmentId": 7, "patientId": 1024, "level": 5, "levelName": "Lifestyle",
  "responses": [ { "assessmentQuestionId": 125, "assessmentAnswer": "130" },
                 { "assessmentQuestionId": 126, "assessmentAnswer": "85" } ] }
// Response (single-level scored)
{ "success": true, "message": "Assessment Submitted successfully", "data": true,
  "assessmentResponse": { "percentage": 78, "maxRange": 100, "result": "Low risk" } }
// Response (multi-level) → assessmentResponse keyed per level name
// Response (assessmentId 1 = BP) → assessmentResponse: { "result": "...Prehypertension.<br/>Recheck in 1 year." }
```

**POST /api/assessments/behaviouralHealth** — body is an **array**; patient from JWT.
```jsonc
// Request
[ { "assessmentId": 2, "assessmentQuestionId": 210, "assessmentOptionId": 803, "patientId": 1024 },
  { "assessmentId": 2, "assessmentQuestionId": 211, "assessmentOptionId": 802, "patientId": 1024 } ]
// Response
{ "success": true, "message": "Assessment Submitted successfully", "data": true,
  "assessmentResponse": { "maxRange": 27, "totalScore": 14, "severity": "Moderate depression",
    "statement": "The scores you have given suggest are Moderate depression to be suffering..." } }
```

**GET /api/patient_assessments/** — patient's scored assessments (from JWT).
```jsonc
// Response
{ "success": true, "message": "Assessments fetched successfully", "data": true,
  "assessments": [ { "patientAssessmentId": 4521, "patientId": 1024, "assessmentName": "Health Risk Assessment",
    "response": { "percentage": 78, "maxRange": 100, "result": "Low risk" } } ] }
```

**POST /api/patient_assessments/** — validated by `patientAssessmentSchema`; `id` present → update.
```jsonc
// Request
{ "patientId": 1024, "assessmentId": 7, "assessmentQuestionId": 125, "assessmentOptionId": 501 }
// Response (201)
{ "success": true, "message": "Assessment Submitted successfully", "data": true,
  "patientAssessment": { "id": 4522, "assessmentId": 7, "patientId": 1024 } }
```

### Care plan

**GET /api/care/plan** — `?companyId=57&patientId=1024`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Data fetched successfully", "data": true,
  "carePlans": { "carePlanId": 33, "planName": "Gold Care",
    "planBenefits": ["Free teleconsultation", "Annual health checkup"], "validUpto": "31-12-2026",
    "patientDetails": { "patientId": 1024, "patientName": "Amit Kumar", "age": 36, "bloodGroup": "O+" },
    "planDetails": { "teleconsultation": { "total": 10, "remaining": 10 }, "labTests": { "total": 4, "remaining": 4 } },
    "isPlanValid": 1 } }
```

### Doctors & care team

**GET /api/doctors/:employer_id** — `?search=sharma`.
```jsonc
// Response
{ "success": true, "message": "Doctors fetched successfully.", "data": { "doctors": [
  { "doctorId": 57, "doctorName": "Dr. Anil Sharma", "speciality": "Cardiology", "experience": "12 years",
    "profilePic": "https://.../57.jpg" } ] } }
```

**GET /api/doctors/slot/:doctorId**
```jsonc
// Response
{ "success": true, "message": "Data fetched successfully.", "data": { "availability": [
  { "date": "2026-07-20", "slots": ["14:30", "15:00", "15:30"] } ] } }
```

**GET /api/care-team/get** — patient from JWT; `?search=meera`.
```jsonc
// Response
{ "success": true, "message": "Care team fetched successfully.", "data": { "result": [
  { "doctorId": 61, "doctorName": "Dr. Meera Iyer", "speciality": "Endocrinology" } ] } }
```

**POST /api/care-team/create** — validated by `addDoctorsValidation`.
```jsonc
// Request
{ "doctorIds": [57, 61] }
// Response
{ "success": true, "message": "Doctors added successfully.", "data": { "result": [
  { "patientId": 1024, "doctorId": 57 }, { "patientId": 1024, "doctorId": 61 } ] } }
```

### Appointments

> These endpoints nest the payload under `data` (real object, not `data: true`).

**POST /api/appointment/book** — validated by `bookAppointmentValidation`.
```jsonc
// Request
{ "patientId": 1024, "doctorId": 57, "date": "2026-07-20", "time": "14:30", "is_paid": 1 }
// Response
{ "success": true, "message": "Appointment booked successfully.", "data": { "appointment": {
  "patientId": 1024, "doctorId": 57, "date": "2026-07-20", "time": "14:30", "isConfirmed": false, "isActive": true } } }
```

**GET /api/appointment/get/:status** — `status` 1=upcoming, 2=completed, 3=cancelled; `?search=`.
```jsonc
// Response (status=1)
{ "success": true, "message": "Appointments fetched successfully.", "data": { "formattedAppointments": [
  { "appointmentId": 3301, "doctorName": "Dr. Anil Sharma", "speciality": "Cardiology", "experience": "12 years",
    "dateTime": "20 Jul 2026, 2:30 PM", "isConfirmed": false, "appointmentStatus": "Upcoming",
    "profilePic": "https://.../57.jpg", "doctorId": 57, "joinNow": 0 } ] } }
// status=2 items add: callDuration "00:12:45", prescriptionURL; status=3 items: appointmentStatus "Cancelled"
```

**GET /api/appointment/my-medicines** — `?search=&timeFilter=last_month`.
```jsonc
// Response
{ "success": true, "message": "Medicines fetched successfully.", "data": { "formattedMedicines": [
  { "medicineId": 88, "doctorName": "Dr. Anil Sharma", "dateTime": "10 Jul 2026, 11:00 AM",
    "prescriptionURL": "https://.../88.pdf", "medicineURL": "https://mchemist.example.com" } ] } }
```

**POST /api/appointment/reschedule** / **/cancel** — validated.
```jsonc
// reschedule Request
{ "appointmentId": 3301, "date": "2026-07-22", "time": "16:00" }
// reschedule Response
{ "success": true, "message": "Appointment rescheduled successfully.", "data": { "updatedAppointment": { "appointmentId": 3301, "date": "2026-07-22", "time": "16:00" } } }
// cancel Request
{ "appointmentId": 3301 }
// cancel Response
{ "success": true, "message": "Appointment cancelled successfully.", "data": { "updatedAppointment": { "appointmentId": 3301, "status": 3 } } }
```

**GET /api/appointment/details/:appointmentId**
```jsonc
// Response (abridged)
{ "success": true, "message": "Appointment details fetched successfully.", "data": { "response": {
  "doctorDetails": { "doctorId": 57, "name": "Dr. Anil Sharma", "speciality": "Cardiology", "appointmentDate": "2026-07-20", "appointmentTime": "14:30" },
  "patientDetails": { "name": "Rahul Verma", "patientId": 1024, "age": 34, "gender": "Male", "bloodGroup": "B+" },
  "healthDetails": { "overAllHealthScore": "98", "sugar": "90", "heartRate": "72", "bloodPressure": "115/80" },
  "prescriptionURL": "https://.../3301.pdf",
  "medicinePrescribed": [ { "medicineName": "Amlodipine", "drugForm": "Tablet", "strength": "5mg", "frequency": "Once daily", "duration": "30 days" } ] } } }
```

**GET /api/appointment/medical-records/:companyId** — patient history, files, lab tests, appointments (nested under `data.response`).

**GET /api/appointment/talkToDoctor** — instant-consult patient+doctor context (nested under `data.response`).

**GET /api/appointment/dashboard** — next appointment, care team, health snapshot (nested under `data.response`).

**POST /api/appointment/fetchCallDetails**
```jsonc
// Request
{ "patientId": 1024 }
// Response
{ "success": true, "message": "Data fetched successfully.", "data": { "data": { "doctorIds": [57, 61] } } }
```

**POST /api/appointment/check-appointment-status** — validated; returns `{}` when none found.

**GET /api/medicines** — `?search=para`.
```jsonc
// Response
{ "success": true, "message": "Medicines fetched successfully.", "data": { "medicines": [
  { "id": 0, "medicineName": "Other" }, { "id": 88, "medicineName": "Paracetamol 500mg" } ] } }
```

### Data / lookups

**GET /api/data/patient/:type** — `type` ∈ medications, healthProblems, symptoms, vaccinations, allergies, familyRelation, drugForms, frequency.
```jsonc
// Response (type=medications)
{ "success": true, "message": "Data fetched successfully", "data": [
  { "id": 12, "categoryName": "Analgesics", "medicationName": "Paracetamol 500mg" } ] }
```

**GET /api/data/states** / **/cities** (`?state_id=2`)
```jsonc
// states Response
{ "success": true, "message": "Data fetched successfully", "data": true, "states": [ { "id": 1, "state": "Andhra Pradesh" } ] }
// cities Response
{ "success": true, "message": "Data fetched successfully", "data": true, "cities": [ { "id": 101, "city": "Bengaluru", "state_id": 2 } ] }
```

**POST /api/data/upload** — base64 file + target folder `type`.
```jsonc
// Request
{ "file": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...", "type": "prescriptions" }
// Response
{ "success": true, "message": "File Uploaded Successfully", "data": true,
  "fileUrl": { "fileName": "9f3c...c.png", "fileExtension": "png", "fileUrl": "https://.../assets/prescriptions/2026/9f3c...c.png" } }
```

**POST /api/data/getTalkToDoctorCallListApi**
```jsonc
// Request
{ "patientId": 4521, "call_id": "CALL-2026-000987" }
// Response (abridged; data is an array of waiting patients)
{ "success": true, "message": "Data fetched successfully", "data": [
  { "patient_id": 4521, "first_name": "Rahul", "last_name": "Sharma", "age": 34, "gender": "Male",
    "employer_name": "Acme Corp", "group_id": 7, "status": "waiting", "call_id": "CALL-2026-000987", "pcp_doctor_id": 88 } ] }
```

### Documents

**GET /api/document/folders** — `?page=1&search=lab`; patient from JWT.
```jsonc
// Response (201)
{ "success": true, "message": "Folders fetched successfully", "data": true,
  "folders": { "folders": [ { "id": 15, "folderName": "Lab Reports", "folderType": "lab" } ], "totalCount": 2 } }
```

**GET /api/document/files** — `?folderId=15&timeFilter=2&search=` (timeFilter 0=all,1=1mo,2=6mo,3=1yr).
```jsonc
// Response (201)
{ "success": true, "message": "Files fetched successfully", "data": true,
  "files": [ { "id": 305, "fileName": "CBC_Report.pdf", "fileType": "application/pdf",
    "fileUrl": "https://.../cbc_report.pdf", "createdAt": "12/06/2026" } ] }
```

### Lab tests

**GET /api/labs/packages-and-tests** — `?companyId=87&search=blood`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Data fetched successfully", "data": { "result": {
  "categoryPackages": { "Diabetes": [ { "packageId": 12, "packageName": "Diabetic Care Panel", "packageType": "Package",
    "packageMode": "Pathology", "noOfTest": 5, "price": 799, "tests": ["Fasting Blood Sugar", "HbA1c"], "labId": 4 } ] },
  "categoryTests": { "Hematology": [ { "testId": 55, "testName": "Complete Blood Count", "testType": "Test",
    "testMode": "Pathology", "testCode": "T55", "labId": 4 } ] } } } }
```

**POST /api/labs/upload** — validated by `uploadPrescriptionSchema`.
```jsonc
// Request
{ "prescriptionFile": "https://.../prescription.jpg", "notes": "Fasting advised", "patientId": 1024 }
// Response
{ "success": true, "message": "Prescription uploaded successfully", "data": { "prescription": {
  "id": 33, "prescriptionFile": "https://.../prescription.jpg", "notes": "Fasting advised", "patientId": 1024, "isActive": true } } }
```

**POST /api/labs/addToCart** — validated by `addToCartSchema` (`type` 1=test/2=package, `mode` 1=Pathology/2=Radiology).
```jsonc
// Request
{ "type": 1, "mode": 1, "referenceId": 55, "patientId": 1024, "companyId": 87, "labId": 4, "labType": "external", "code": "T55" }
// Response
{ "success": true, "message": "Item added to cart successfully", "data": { "cartItem": {
  "id": 210, "cartId": 77, "patientId": 1024, "type": "Test", "mode": "Pathology", "referenceId": 55, "companyId": 87 } } }
```

**GET /api/labs/cities**
```jsonc
// Response
{ "success": true, "message": "Cities fetched successfully", "data": { "cities": [ { "id": 1, "cityName": "Bengaluru" } ] } }
```

**POST /api/labs/cart/details** (and **/cart/unpaid-lab-details**)
```jsonc
// Request
{ "patientId": 1024 }
// Response (abridged; array of cart line rows)
{ "success": true, "message": "Cart details fetched successfully", "data": { "cartDetails": [
  { "cartId": 77, "itemId": 210, "itemType": "Test", "referenceId": 55, "testName": "Complete Blood Count",
    "labName": "Metropolis", "labId": 4, "price": 300, "discount": 50, "city": "Bengaluru" } ] } }
```

**POST /api/labs/cart/lab-details** — labs available for the cart in a city.
```jsonc
// Request
{ "companyId": 87, "patientId": 1024, "cityName": "Bengaluru" }
// Response
{ "success": true, "message": "Lab details fetched successfully", "data": { "labDetails": {
  "cartId": 77, "mode": "Pathology", "labDetails": [ { "labId": 4, "labName": "Metropolis", "price": 300 } ] } } }
```

**POST /api/labs/branches**
```jsonc
// Request
{ "labId": 4, "labCityId": 1 }
// Response
{ "success": true, "message": "Branches fetched successfully", "data": { "branches": [
  { "id": 9, "labId": 4, "branchName": "Indiranagar Branch", "branchAddress": "100ft Road, Bengaluru" } ] } }
```

**POST /api/labs/tests-and-packages** — result spread directly (keys `packages`/`tests`).
```jsonc
// Request
{ "companyId": 87, "search": "sugar", "labId": 4, "cartId": 77 }
// Response
{ "success": true, "message": "Data fetched successfully", "data": {
  "packages": { "Diabetes": [ { "packageId": 12, "packageName": "Diabetic Care Panel", "price": 799 } ] },
  "tests": { "Hematology": [ { "testId": 55, "testName": "Blood Sugar Fasting", "testMode": "Pathology" } ] } } }
```

**POST /api/labs/test-or-package-details** — `type` 1=test, 2=package.
```jsonc
// Request
{ "id": 12, "type": 2 }
// Response (package)
{ "success": true, "message": "Data fetched successfully", "data": { "result": {
  "TestOrPackageId": 12, "nameOfTest": "Diabetic Care Panel", "typeOfTestOrPackage": "package", "packagePrice": 799,
  "Tests": [ { "testId": 55, "nameOfTestsInPackages": "HbA1c", "subTests": [ { "subTestId": 88, "nameOfSubTests": "HbA1c %" } ] } ] } } }
```

**POST /api/labs/order** — validated by `createLabOrderSchema` (order header + `orderDetails[]`).
```jsonc
// Request (abridged)
{ "patientId": 1024, "bookingDate": "2026-07-20", "bookingTime": "10:00 AM", "labId": 4, "labCityName": "Bengaluru",
  "labBranchId": 9, "price": 300, "discountApplied": 50, "totalPrice": 250, "orderStatus": "pending", "paymentStatus": "unpaid",
  "orderDetails": [ { "cartId": 77, "type": "1", "referenceId": 55, "name": "Complete Blood Count", "price": 300, "discount": 50, "total": 250 } ] }
// Response
{ "success": true, "message": "Order created successfully", "data": { "labOrder": {
  "id": 501, "patientId": 1024, "totalPrice": 250, "orderStatus": "pending", "paymentStatus": "unpaid" } } }
```

**GET /api/labs/orders/:orderId** — orders with nested `orderDetails[]` (plain JSON, no encryption on this route).
**GET /api/labs/list/:patientId** — booked lab test list + cart count (no JWT on this route).
```jsonc
// list Response (abridged)
{ "success": true, "message": "Lab tests fetched successfully", "data": { "data": {
  "labTestList": [ { "labOrderId": 501, "uniqueBookingId": "48213", "labName": "Metropolis", "type": "Test",
    "bookingDate": "2026-07-20", "orderStatus": "confirmed", "labReportURL": null } ], "cartId": 77, "cartCount": 2 } } }
```

**PUT /api/labs/order** (update, no JWT), **PUT /api/labs/cart** (updateLabId), **POST /api/labs/re-schedule-lab** — all return the Sequelize affected-count array:
```jsonc
// Response
{ "success": true, "message": "Lab order updated successfully", "data": { "result": [1] } }
```

**GET /api/labs/labDetail/:cartId** — lab/branch rows + cart item rows (`data.data` + `data.cartDetails`).
**DELETE /api/labs/remove/:cartId** (item), **DELETE /api/labs/cartRemove/:cartId** (whole cart), **DELETE /api/labs/prescription/:prescriptionId** — return `{ success, message }`.
**GET /api/labs/prescription/:patientId** — `{ ..., "data": { "prescription": [ { "id": 33, "prescriptionFile": "https://..." } ] } }`.

**POST /api/labs/purchaseLabTest** — branches by state:
```jsonc
// Request
{ "patientId": 1024, "totalPrice": 250, "cartId": 77, "orderId": 501 }
// Response (free booking)
{ "success": true, "message": "Your booking has been confirmed", "data": { "uniqueBookingId": 48213 } }
// Response (paid → Razorpay order)
{ "success": true, "message": "Payment link generated successfully", "data": { "paymentDetail": {
  "key": "rzp_test_xxx", "amount": 25000, "currency": "INR", "order_id": "order_Nabc123",
  "callback_url": "https://.../api/labs/paymentStatus", "notes": { "patientId": 1024, "cartId": 77, "orderId": 501 } } } }
```

**POST /api/labs/paymentStatus** — Razorpay callback.
```jsonc
// Request
{ "cartId": 77, "orderId": 501, "status": "success",
  "response": { "razorpay_payment_id": "pay_Nxyz", "razorpay_order_id": "order_Nabc123", "razorpay_signature": "abcd..." } }
// Response (success)
{ "success": true, "message": "Your booking has been confirmed" }
// status "failed" → 402 paymentFailed, data: {}
```

**PUT /api/labs/updateAddress** / **GET /api/labs/getLabTestAddress** — patient address (patientId from JWT).
```jsonc
// updateAddress Request
{ "id": 15, "address": "12 MG Road", "pincode": "560001", "state": "Karnataka", "city": "Bengaluru" }
// getLabTestAddress Response
{ "success": true, "message": "Data Fetched Successfully", "data": { "address": {
  "id": 15, "patientId": 1024, "zip_code": "560001", "state": "Karnataka", "city": "Bengaluru", "address": "12 MG Road" } } }
```

**GET /api/labs/check-payment-status** (`?patient_id=&company_id=`), **POST /api/labs/create-payment-call**, **/verify-call-coupon**, **/paymentStatusCallCheck** — teleconsult call payment flow (Razorpay). Example:
```jsonc
// create-payment-call Request
{ "patient_id": 1024, "company_id": 87, "total_price": 500, "call_type": "video", "call_date": "2026-07-20", "call_time": "03:00 PM" }
// verify-call-coupon Response
{ "success": true, "message": "Coupon verified successfully", "data": { "result": { "is_verified": 1 } } }
```

> **External-integration lab routes** (`getRedcliffAloc`, `getRedcliffSlot`, `createRedcliffBooking`,
> `redCliffReport`, `fetchRedcliffReport`), the **Mobile** payment variants
> (`purchaseLabTestMobile`, `paymentStatusMobile`), and `labtestnotification` follow the same
> request/response patterns as their web counterparts and integrate with the Redcliffe lab and
> Razorpay-mobile SDK; their report webhooks echo `req.body` back.

### Notifications

**POST /api/notify/notifications** — payload wrapped in `data`.
```jsonc
// Request
{ "data": { "title": "BP reading violating", "description": "Systolic is 145, violating normal value.",
  "referenceId": 4521, "role": "patient", "isActive": true } }
// Response
{ "success": true, "message": "Notification created successfully.", "data": true,
  "result": { "message": "Notification created successfully." } }
```

**GET /api/notify/notifications** — `?role=patient&referenceId=4521&filter=today` (filter: all|today|this_week|this_month).
```jsonc
// Response
{ "success": true, "message": "Notifications fetched successfully.", "data": true,
  "notifications": { "notifications": [ { "id": 7781, "title": "Glucometer reading violating",
    "description": "Sugar is 185...", "referenceId": 4521, "role": "patient", "isActive": 1, "isRead": 0 } ], "totalCount": 3 } }
```

**POST /api/notify/removeNotification** (`{ "notificationId": 7781 }`) and **/updateReadNotification** (`{ "role": "patient", "referenceId": 4521 }`) — return `{ ..., "notification": [<affectedCount>] }`.

### Help

**GET /api/help/faq** — `?q=appointment`.
```jsonc
// Response
{ "success": true, "message": "FAQs fetched successfully", "data": true,
  "faqData": [ { "title": "How do I book an appointment?", "description": "Go to the Appointments tab..." } ] }
```

**POST /api/help/send-email** — validated by `sendMessageValidation`; sender from `req.user`.
```jsonc
// Request
{ "message": "I am unable to view my lab reports, please help." }
// Response
{ "success": true, "message": "Email sent successfully" }
```

### Vital monitoring

**GET /api/vital-monitoring/get-device** — device catalog with input field specs.
```jsonc
// Response
{ "success": true, "message": "Device fetched successfully.", "data": true, "deviceDetails": [
  { "id": 1, "device_name": "Blood Pressure Monitor", "normal_range": "100-140/60-90 mmHg", "fields": [
    { "field_id": 3, "key": "systolic", "label": "Systolic", "type": "number", "maxLength": 3 } ] } ] }
```

**GET /api/vital-monitoring/get-device-monitoring** — `?patient_id=4521`.
```jsonc
// Response
{ "success": true, "message": "Device fetched successfully.", "data": true, "monitoryDetails": [
  { "device_id": 1, "device_name": "Blood Pressure Monitor", "date": "16 Jul, 2026 09:12 AM", "is_manual": 1,
    "fields": [ { "param_key_name": "systolic", "value": 128 }, { "param_key_name": "diastolic", "value": 82 } ] } ] }
```

**POST /api/vital-monitoring/post-vital-monitoring** — nested device readings (flattened + persisted per field).
```jsonc
// Request
{ "patient_id": 4521, "deviceDetails": [ { "id": 1, "fields": [
  { "param_key_name": "systolic", "param_key_id": 3, "param_value": 128, "status": 1, "is_manual": 1 },
  { "param_key_name": "diastolic", "param_key_id": 4, "param_value": 82, "status": 1, "is_manual": 1 } ] } ] }
// Response → data: true, monitoryDetails: [ <created rows> ]
```

**GET /api/vital-monitoring/get-detail-monitoring** — `?patient_id=&device_id=&from_date=&to_date=`.
```jsonc
// Response
{ "success": true, "message": "Device fetched successfully.", "data": true, "monitoringData": {
  "device_name": "Blood Pressure Monitor", "result": [ { "date": "10-07-2026", "systolic": 128, "diastolic": 82 } ] } }
```

**GET /api/vital-monitoring/view-device-comment** (`?patient_id=&device_id=`) and **POST /api/vital-monitoring/post-device-comment**:
```jsonc
// post-device-comment Request
{ "patient_id": 4521, "device_id": 1, "comment": "BP trending slightly high; recommend follow-up.",
  "created_by": 88, "user_type": 2, "status": 1 }
// Response → data: true, deviceComments: { <created row> }
```

### Care navigator (`jwtAuthCareNavigator`)

**POST /api/careNavigator/login** — validated by `loginPatientSchema`.
```jsonc
// Request
{ "patientId": 1024 }
// Response
{ "success": true, "message": "Login successful.", "data": {
  "token": "eyJhbGci...", "userDetails": { "id": 1024, "email": "john.doe@example.com", "currentRole": "patient" },
  "loggedBy": "careNavigator" } }
```

**GET /api/careNavigator/profile** / **POST /api/careNavigator/profile**
```jsonc
// GET Response
{ "success": true, "message": "Care navigator details retrieved successfully.", "data": { "userDetails": {
  "id": 5, "name": "Priya Sharma", "email": "priya@akosmd.in", "phone": "9876543210", "gender": "female", "age": 32 } } }
// POST Request
{ "name": "Priya Sharma", "email": "priya@akosmd.in", "phone": "9876543210", "gender": "female", "age": 32, "profilePic": "https://.../5.jpg" }
// POST Response → { "success": true, "message": "Care navigator profile updated successfully." }
```

**GET /api/careNavigator/appointments** — `?search=&status=1&filter=today`, header `companyId`.
```jsonc
// Response
{ "success": true, "message": "Appointments fetched successfully.", "data": { "formattedAppointments": [
  { "patientId": 1024, "appointmentId": 3391, "doctorName": "Dr. Rao", "patientName": "John Doe",
    "dateTime": "16 Jul 2026, 3:30 PM", "isConfirmed": 1, "appointmentStatus": "Upcoming", "doctorId": 88, "joinNow": 0 } ] } }
```

**POST /api/careNavigator/reschedule / /cancel / /approve / /updateAppointment** — `{ appointmentId, [date, time] }` → `{ ..., "data": { "updatedAppointment": [1] } }`.

**GET /api/careNavigator/patients / /myPatients** — `?search=&filter=`, header `companyId` → `{ ..., "data": { "userDetails": [ { "id": 1024, "name": "John Doe", "email": "...", "age": 40 } ] } }`.

**GET /api/careNavigator/labTests** — `?status=&search=&filter=`, header `companyId`.
```jsonc
// Response
{ "success": true, "message": "Patient details fetched successfully.", "data": { "labTests": [
  { "orderId": 501, "patientName": "John Doe", "testName": "CBC", "orderStatus": 1, "labReportURL": null } ] } }
```

**GET /api/careNavigator/dashboard** — header `companyId`; counts + lists spread directly under `data`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Data fetched successfully.", "data": {
  "appointments": [ ... ], "labTests": [ ... ], "totalPatientCount": 250, "totalMyPatientCount": 40,
  "totalAssignedPatient": 3, "chatCount": 0, "rpmCount": 0 } }
```

**GET /api/careNavigator/prescriptions**, **/getPackages**, **/orders/:orderId** — list endpoints (`prescriptions`, `packages`, `labOrders`).
**POST /api/careNavigator/updateLabOrder** (`{ orderId, status }`), **/uploadLabReport** (`{ orderId, labReportURL }`), **/uploadPrescription** (`{ patientId, doctorId, appointmentId, prescriptionURL }`), **/send-email** (`{ message }`).
**GET /api/careNavigator/preemployeelabTests** and **POST /api/careNavigator/updatePreLabReport** (`{ id, status, report_url, report_remark }`) — pre-employment lab flow (**responses unencrypted**).

### HR (`jwtAuthHr`)

**GET /api/hr/profile** / **POST /api/hr/profile** (and **/updateHrProfile**)
```jsonc
// GET Response (abridged)
{ "success": true, "message": "Profile fetched successfully.", "data": { "userProfileData": {
  "id": 7, "name": "Anita Verma", "email": "anita.hr@corp.com", "phone": "9900011223", "companyId": 12 } } }
// POST Request → { name, email, phone, gender, age, profilePic, id }  →  message-only response
```

**POST /api/hr/add-pre-employee** — validated by `preEmpAddSchema`; `companyId` from header.
```jsonc
// Request
{ "name": "Ravi Kumar", "email": "ravi@corp.com", "phone": "9811122233", "gender": "male", "age": 29,
  "dateofbirth": "1997-05-14", "city": "Bengaluru", "state": "Karnataka", "zip_code": "560001",
  "companyId": "12", "type": 1, "health_check_up_date": "2026-08-01" }
// Response → { "success": true, "message": "Pre-employee created successfully." }
```

**GET /api/hr/preEmployee** — `?companyId=&status=&search=&from_date=&to_date=`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Pre-employee retrieved successfully.", "data": { "data": {
  "userDetails": [ { "id": 77, "name": "Ravi Kumar", "email": "ravi@corp.com", "isActive": 3 } ],
  "statusWise": { "preEnroll": [ { "status": "pending", "count": 12 } ], "anual": [ { "status": "completed", "count": 8 } ] } } } }
```

**GET /api/hr/assesmentHra** (`hraDetaails`, `pendingHra`, `empMonthWise`), **/doctorConsultancy** (`noOfEmpTakenCall`, `speciallityWise`), **/healthRisk** (`cardioResult`, `hyperResult`, `daibeticsResult`) — company analytics (all nested under `data.data`).

**GET /api/hr/manageEmployee** — `?companyId=&search=&filter=&status=`.
```jsonc
// Response (abridged)
{ "success": true, "message": "Number of employees.", "data": { "employeeStatus": {
  "employeeNewlyAdded": 4, "employeeDisabled": 2, "employeeInSystem": 120,
  "empDetails": [ { "id": 1024, "name": "John Doe", "email": "john.doe@corp.com", "status": 1 } ] } } }
```

**POST /api/hr/disableEnableEmployee** (`{ companyId, patientId, status }`), **/addEmployee** (`{ name, email, phone, gender, age, dateofbirth, city, state, zip_code }`, companyId from header), **GET /api/hr/employeeEngagement**, **/sendReminder** (`?email=`), **POST /api/hr/send-email** (`{ message, email }`), **GET /api/hr/user-module** (`?id=7` → `userModuleinfo`, `userCompanyInfo`).

### Chat (REST)

> Chat/OpenTok responses are AES-encrypted on the wire; shapes below are decrypted.
> They use the `data: true` convention with the payload spread at top level.

**POST /api/chat/initiate-chat**
```jsonc
// Request
{ "senderId": 101, "receiverId": 205, "message": "Hello doctor" }
// Response
{ "success": true, "message": "Data fetched successfully", "data": true, "chat": {
  "id": 5001, "senderId": 101, "receiverId": 205, "message": "Hello doctor", "isRead": 0 } }
```

**POST /api/chat/send-message**
```jsonc
// Request
{ "senderId": 101, "senderType": 1, "receiverId": 205, "receiverType": 2, "message": "How are you feeling today?", "messageType": "text", "roomId": "101_205" }
// Response → data: true, newMessage: { ...persisted row... }
```

**GET /api/chat/chat-history** — `?senderId=&senderType=&receiverId=&receiverType=`.
```jsonc
// Response (grouped by date)
{ "success": true, "message": "Data fetched successfully", "data": true, "chatHistory": [
  { "date": "Today", "messages": [ { "id": 5001, "message": "Hello doctor", "time": "02:42 PM",
    "type": "send", "userId": 101, "profilePic": "uploads/patient/101.jpg" } ] } ] }
```

**GET /api/chat/user-status** (`?userId=&userType=` → `userStatus`), **POST /api/chat/update-user-status** (`{ userId, userType, isOnline }`), **GET /api/chat/chat-list** (`?userId=&userType=&search=` → `chatList`), **POST /api/chat/update-read-status** (`{ senderId, senderType, receiverId, receiverType }`), **GET /api/chat/searchList** (`?type=&search=`, header `companyId`; type 1=patient/2=doctor/3=careNavigator → `list`).

### OpenTok (video)

> Requests use plain query params; **responses are still AES-encrypted** (`sendSuccess`).

**GET /api/opentok/generate-session** → `{ ..., "data": true, "sessionId": "2_MX40NjMw...

**GET /api/opentok/generate-token** — `?sessionId=<id>&role=publisher&data=`; missing `sessionId` → 400.
```jsonc
// Response
{ "success": true, "message": "Data fetched successfully", "data": true, "token": "T1==cGFydG5lcl9pZD00..." }
```

### Migration / sync (`x-sync-api-key`, plain JSON)

All four require header `x-sync-api-key: <SYNC_API_KEY>`, accept plain (non-encrypted) JSON,
and return plain JSON with a service summary in `data`.

**POST /api/migration/corporate** — `corporate_name` required.
```jsonc
// Request (abridged)
{ "corporate_id": 88, "corporate_name": "Acme Industries", "employees": [
  { "id": 9001, "emp_name": "Jane Doe", "emp_email": "jane@acme.com", "emp_mobile": "9876543210",
    "bookings": [ { "id": 7001, "booking_ID": "BK-7001", "package_name": "Full Body Checkup",
      "package_amount": 1500, "diagnostic_id": 42, "emp_date_of_checkup": "2026-05-01" } ] } ] }
// Response (abridged)
{ "success": true, "message": "Corporate data migrated successfully", "data": {
  "corporate": { "id": 15, "company_name": "Acme Industries", "employer_id": "482913", "is_migrated": true },
  "employees_processed": 1, "employees_created": 1, "bookings_created": 1,
  "details": [ { "legacy_employee_id": 9001, "patientId": 3201, "created": true,
    "bookings": [ { "legacy_booking_id": 7001, "labOrderId": 8801, "created": true } ] } ] } }
```

**POST /api/migration/doctor** — array (or `{ data|doctors: [] }`, or single object).
```jsonc
// Request
[ { "id": 3001, "first_name": "Dr. John", "last_name": "Smith", "email": "john.smith@med.com",
    "mobile_number": "9998887776", "specialty": { "id": 12, "specialty_name": "Cardiology" },
    "corporates": [ { "corporate_id": 88, "corporate_name": "Acme Industries" } ] } ]
// Response → data: { doctors_processed, doctors_created, specialities_created, details: [...] }
```

**POST /api/migration/package** — array of packages → `data: { packages_processed, master_packages_created, lab_packages_created, details: [...] }`.

**POST /api/migration/lab** — array of diagnostics with `addresses[]` and `packages[]` → `data: { labs_processed, labs_created, branches_created, master_tests_created, lab_tests_created, details: [...] }`.

---

## WebSocket (Socket.IO) events

The Socket.IO server is attached to the same HTTP server (default port `3001`).
Handlers live in [index.js](index.js). Most events accept an acknowledgement
callback that receives `{ success: boolean, ... }`.

**Room naming:** `` `${senderId}_${senderType}_${receiverId}_${receiverType}` ``

| Event (client → server) | Payload | Purpose |
|-------------------------|---------|---------|
| `joinRoom` | `{ senderId, senderType, receiverId, receiverType }` | Join the sender/receiver rooms. |
| `sendMessage` | `{ senderId, senderType, receiverId, receiverType, message, messageType }` | Persist and broadcast a chat message. |
| `createRoom` | `{ senderId, senderType, receiverId, receiverType }` | Create a chat room. |
| `getChatList` | `{ userId, userType }` | Fetch the user's chat list. |
| `getChatHistory` | `{ senderId, senderType, receiverId, receiverType }` | Fetch chat history. |
| `getNotifications` | `{ role, referenceId, filter }` | Fetch notifications. |
| `fetchPatientCallDetail` | `{ userId }` | Get pending call details for a patient. |
| `listen` | `{ userId, userType }` | Join all of a user's chat rooms. |
| `incomingCallListUpdate` | `{ patientid, docid, groupid, callid }` | Update the incoming‑call list. |
| `incomingCallTalkToDoctor` | `{ connectDoctorIds, groupIds, patientId, callId }` | Broadcast a talk‑to‑doctor call. |
| `incomingCallList` | `{ docid, groupId }` | Broadcast the waiting list. |
| `incomingCall` | `{ docid, groupId }` | Get the waiting list (callback only). |
| `acceptedCallByDoctor` | `{ userId }` | Doctor accepted a call. |
| `declinefromPatient` | `{ doctorId, patientId, connectDocId }` | Patient declined a call. |
| `declinefromDoctor` | `{ doctorId, patientId, connectDocId }` | Doctor declined a call. |
| `disconnect` | — | Socket disconnected. |

| Event (server → client) | Emitted with | Meaning |
|-------------------------|--------------|---------|
| `chatList` | `{ …, chatList }` | Updated chat list for a room. |
| `chatHistory` | `{ …, chatHistory }` | Updated chat history for a room. |
| `incomingCallListFront` | `{ waitingList }` | Front‑end incoming‑call list. |
| `acceptedCallRecordFront` | `{ callDetails }` | A call was accepted. |
| `declinefromPatientFront` | `{ doctorId, patientId, connectDocId }` | Patient declined. |
| `declinefromDoctorFront` | `{ doctorId, patientId, connectDocId }` | Doctor declined. |

---

## Status codes

From [config/constant.js](config/constant.js):

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 203 | Success (custom) |
| 400 | Bad request |
| 401 | Unauthorized |
| 402 | Payment required |
| 403 | Forbidden |
| 404 | Not found |
| 500 | Internal server error |

Rate‑limited requests return `429` with a plain‑text message.

---

## Environment variables

Configured via `.env` (see [index.js](index.js) and middleware). Key variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP/Socket.IO port (default `3001`). |
| `JWT_SECRET` | Secret for signing/verifying JWTs. |
| `SYNC_API_KEY` | Shared secret for `/api/migration/*`. |
| Database / SendGrid / Razorpay / OpenTok | See `config/` and `.env`. |

---

*Generated from source in `d:\backend\live\patientportalapi`. For request/response
body schemas of a specific endpoint, see the corresponding controller in
[controllers/](controllers/) and validators in [validation/](validation/).*
