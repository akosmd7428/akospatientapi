# ABDM Integration Plan for AKOS Healthcare Platform

**Date:** 2026-11-23
**Catalogue Version:** 2026.09.16
**Organization:** AKOS MD HEALTHCARE PRIVATE LIMITED
**Entity Type:** Private (confirmed)
**Product ID:** APP-2026-00359
**Sandbox Status:** Approved
**Client ID:** SBX_000081
**Client Secret:** Received (stored in .env only - never in this file)
**Callback URL:** Not configured (pending setup)
**Admin:** Amit Kumar (amit.kumar@akosmd.in)
**Role:** HIP (Health Information Provider) + HIU (Health Information User)
**Gateway:** HIE-CM v3
**HIE-CM Tracks:** M2 (HIP = M1+M2+M4 combined) + M3 (HIU)
**Track Status:** 0/2 approved, both Pending Implementation

---

## 1. Executive Summary

AKOS is a multi-tenant healthcare SaaS platform serving patients, doctors, care navigators, HR admins, OHC staff and pharmacies. This plan integrates ABDM milestones M1 through M4 into the existing `akospatientapi` (Node.js/Express/MySQL) backend, with corresponding changes in all frontend portals.

**Current ABDM Status:** 0% functional. Only placeholder fields exist (`patientDetails.abha_id`, `patientDetails.consent`). No ABDM gateway calls, no FHIR resources, no consent flows.

**Goal:** Full ABDM compliance as a HIP+HIU so AKOS facilities can:
- Create/verify ABHA IDs for patients (M1)
- Link care contexts and share health records (M2)
- Request and receive records from other providers with consent (M3)
- Register facilities and professionals on ABDM registries (M4)

---

## 2. AKOS Ecosystem Map

| Project | Tech | Role in ABDM |
|---------|------|-------------|
| **akospatientapi** | Node.js/Express/MySQL/Sequelize | Central backend - ALL ABDM APIs go here |
| **akosMd_patient** (web) | React 18 / Redux | Patient-facing ABHA creation, consent UI |
| **akosmd_mobile_app** | React Native | Mobile ABHA creation, QR scan-and-share |
| **akos-frontend-doctor** | React 18 / Redux | Doctor portal - link care context after consultation |
| **carenavigator** | React 18 / Redux | Care navigator - assist patients with ABHA |
| **akos-frontend-ohc** | React 18 / Redux | OHC - facility-level ABHA flows |
| **hr_portal_akos** | React 18 / Redux | Admin - facility/professional registration (M4) |
| **Mchemist_new_design** | React 18 / RTK Query | Pharmacy - prescription records as FHIR bundles |

---

## 3. Prerequisites (Before Any Code)

| # | Prerequisite | Status | Owner | Exit Condition |
|---|-------------|--------|-------|----------------|
| P1 | Apply for ABDM Sandbox access | `done` | Admin | Sandbox approved, Product APP-2026-00359 |
| P2 | Confirm entity type (Private/Government) | `done` | Business | Private - AKOS MD HEALTHCARE PRIVATE LIMITED |
| P3 | Register facility on HFR (Health Facility Registry) | `pending` | Admin | HFR ID received |
| P4 | Map facility HIP ID to Client ID | `pending` | Admin | Mapping confirmed on NHPR portal |
| P5 | Set callback URL (bridge) for Client ID | `pending` | DevOps | Bridge URL responding on ABDM sandbox |
| P6 | Obtain ABDM sandbox test Aadhaar numbers | `pending` | QA | Test credentials available |
| P7 | Set up public HTTPS endpoint for callbacks | `pending` | DevOps | URL reachable from ABDM sandbox |

**Progress: 2/7 done (29%) — Client credentials received, sandbox approved**

---

## 4. Architecture Decisions

### 4.1 Where ABDM Code Lives

All ABDM integration goes into `akospatientapi` as new modules:

```
akospatientapi/
├── abdm/                          # NEW - All ABDM code
│   ├── config/
│   │   └── abdmConfig.js          # ABDM URLs, client credentials, cert cache
│   ├── controllers/
│   │   ├── m1Controller.js        # ABHA creation, login, profile
│   │   ├── m2Controller.js        # Care context linking, data transfer
│   │   ├── m3Controller.js        # Consent requests, data fetch
│   │   ├── m4Controller.js        # Facility & professional registration
│   │   └── callbackController.js  # All ABDM callback handlers
│   ├── services/
│   │   ├── gatewayService.js      # Token generation, gateway HTTP client
│   │   ├── encryptionService.js   # RSA encryption for identifiers
│   │   ├── fhirService.js         # Build FHIR bundles from AKOS data
│   │   ├── fidelisService.js      # ECDH key exchange, AES-GCM for data transfer
│   │   ├── m1Service.js           # M1 business logic
│   │   ├── m2Service.js           # M2 business logic
│   │   ├── m3Service.js           # M3 business logic
│   │   └── m4Service.js           # M4 business logic
│   ├── models/
│   │   ├── abhaAccount.js         # ABHA number + address per patient
│   │   ├── careContext.js          # Care contexts (visits) linked to ABHA
│   │   ├── consentRequest.js      # Consent request tracking
│   │   ├── consentArtefact.js     # Granted consent artefacts
│   │   ├── healthRecord.js        # FHIR bundles ready to share
│   │   ├── abdmGatewayLog.js      # Every gateway call logged
│   │   └── abdmCallback.js        # Every callback received logged
│   ├── routes/
│   │   ├── m1Routes.js
│   │   ├── m2Routes.js
│   │   ├── m3Routes.js
│   │   ├── m4Routes.js
│   │   └── callbackRoutes.js      # POST endpoints ABDM calls back on
│   ├── middleware/
│   │   └── abdmAuth.js            # Validate ABDM callback signatures
│   ├── fhir/
│   │   ├── builders/              # One builder per record type
│   │   │   ├── opConsultation.js
│   │   │   ├── prescription.js
│   │   │   ├── diagnosticReport.js
│   │   │   ├── dischargeSummary.js
│   │   │   ├── immunization.js
│   │   │   ├── healthDocument.js
│   │   │   ├── wellnessRecord.js
│   │   │   └── invoice.js
│   │   ├── profiles/              # NRCES profile URLs and validation
│   │   └── templates/             # Base bundle structure
│   └── validation/
│       └── abdmValidation.js      # Request validation schemas
├── models/                         # Existing - add new models here too
├── routes/                         # Existing - mount abdm routes
└── ...
```

### 4.2 New Database Tables

```sql
-- ABHA account linked to patient
CREATE TABLE abdm_abha_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    abha_number VARCHAR(20) NOT NULL,        -- 14-digit with dashes: XX-XXXX-XXXX-XXXX
    abha_address VARCHAR(100) NOT NULL,       -- user@abdm
    link_token VARCHAR(500),                  -- M2 link token (valid 6 months)
    link_token_expiry DATETIME,
    profile_json JSON,                        -- Cached ABHA profile
    status ENUM('active','inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_patient (patient_id),
    UNIQUE KEY uk_abha_number (abha_number),
    INDEX idx_abha_address (abha_address),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- Care contexts (visits) linked to patient's ABHA
CREATE TABLE abdm_care_contexts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    abha_account_id INT NOT NULL,
    care_context_reference VARCHAR(100) NOT NULL,  -- Unique ref (e.g., "AKOS-APPT-12345")
    care_context_display VARCHAR(200) NOT NULL,     -- Display name (NO clinical info)
    care_context_type ENUM('OPConsultation','Prescription','DiagnosticReport',
                           'DischargeSummary','ImmunizationRecord','HealthDocumentRecord',
                           'WellnessRecord','Invoice') NOT NULL,
    source_type ENUM('appointment','labOrder','prescription') NOT NULL,
    source_id INT NOT NULL,                         -- FK to appointment/labOrder/prescription
    linked_at DATETIME,
    link_status ENUM('pending','linked','failed') DEFAULT 'pending',
    link_request_id VARCHAR(100),
    fhir_bundle JSON,                               -- Generated FHIR bundle
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reference (care_context_reference),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (abha_account_id) REFERENCES abdm_abha_accounts(id)
);

-- Consent requests (M3 - HIU side)
CREATE TABLE abdm_consent_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consent_request_id VARCHAR(100),           -- From ABDM callback
    patient_id INT NOT NULL,
    requester_id INT NOT NULL,                 -- Doctor who requested
    purpose_code VARCHAR(50) NOT NULL,
    hi_types JSON NOT NULL,                    -- ["OPConsultation","Prescription",...]
    date_range_from DATETIME NOT NULL,
    date_range_to DATETIME NOT NULL,
    expiry DATETIME NOT NULL,
    status ENUM('requested','granted','denied','revoked','expired') DEFAULT 'requested',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- Consent artefacts (granted consents)
CREATE TABLE abdm_consent_artefacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consent_request_id INT NOT NULL,
    artefact_id VARCHAR(100) NOT NULL,
    status ENUM('granted','revoked','expired') DEFAULT 'granted',
    artefact_json JSON,
    signature TEXT,
    granted_at DATETIME,
    expiry_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_artefact (artefact_id),
    FOREIGN KEY (consent_request_id) REFERENCES abdm_consent_requests(id)
);

-- Gateway API call log (audit trail)
CREATE TABLE abdm_gateway_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    module ENUM('m1','m2','m3','m4') NOT NULL,
    operation VARCHAR(200) NOT NULL,
    direction ENUM('outgoing','incoming_callback') NOT NULL,
    request_payload JSON,
    response_status INT,
    response_payload JSON,
    error_code VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_request_id (request_id),
    INDEX idx_module (module)
);
```

### 4.3 Environment Variables (New)

```env
# ABDM Gateway
ABDM_GATEWAY_URL=https://dev.abdm.gov.in              # Sandbox
ABDM_CLIENT_ID=                                         # From sandbox registration
ABDM_CLIENT_SECRET=                                     # From sandbox registration

# Bridge (callback) URL - must be publicly accessible HTTPS
ABDM_BRIDGE_URL=https://patientportalapi.akosmd.in/api/abdm/callback
ABDM_BRIDGE_ID=                                         # Assigned by ABDM

# Facility
ABDM_HFR_ID=                                            # Health Facility Registry ID
ABDM_HIP_ID=                                            # = HFR ID typically

# Encryption
ABDM_RSA_PUBLIC_KEY_URL=                                 # Certificate endpoint
```

### 4.4 Critical ABDM Rules

1. **v3 APIs only** - Do not use v1/v2 endpoints
2. **Identifiers are encrypted** - ABHA number keeps dashes (XX-XXXX-XXXX-XXXX), bare digits rejected
3. **Callbacks, not responses** - M2/M3 return 202; actual result arrives on callback URL
4. **One bridge for all facilities** - Single callback URL and credentials
5. **Never log** Aadhaar numbers, OTPs, passwords - even in test data
6. **Timestamps** in UTC ISO-8601 with ms: `2022-10-06T15:10:00.587Z`
7. **REQUEST-ID** - Fresh UUID for every call, logged before sending
8. **Certificate caching** - Cache with TTL, not forever

---

## 5. Phase-wise Implementation Plan

---

### PHASE 0: Foundation Setup
**Goal:** Infrastructure and shared ABDM services ready

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 0.1 | Install ABDM dependencies | Add `node-forge`, `uuid`, `axios` (already present), `elliptic` (for Curve25519) to package.json | Dependencies installed, `npm install` succeeds | `done` |
| 0.2 | Create ABDM database tables | SQL migration file for all 5 new tables | Migration file ready, tables auto-created by Sequelize sync | `done` |
| 0.3 | Create Sequelize models | Models for abhaAccount, careContext, consentRequest, consentArtefact, gatewayLog | Models load without error | `done` |
| 0.4 | Build Gateway Service | Token generation (`POST /gateway/v3/sessions`), token caching, HTTP client with ABDM headers (`REQUEST-ID`, `TIMESTAMP`, `X-CM-ID`) | Gateway service loaded and callable | `done` |
| 0.5 | Build Encryption Service | RSA encryption for identifiers using ABDM public certificate, certificate fetch and TTL cache | Encryption service loaded | `done` |
| 0.6 | Build Callback Router | Express routes at `/api/abdm/callback/*` that log every incoming body before parsing | 12 callback endpoints registered | `done` |
| 0.7 | Build ABDM Audit Logger | Log every outgoing call and incoming callback to `abdm_gateway_logs` | Integrated into gatewayService | `done` |
| 0.8 | Setup `.env` ABDM config | Add all ABDM environment variables | Config loads correctly (SBX_000081 confirmed) | `done` |

**Phase 0 Progress: 8/8 done (100%)**

---

### PHASE 1: M4 - Register Facilities & Professionals
**Goal:** AKOS facilities and doctors registered on ABDM registries
**Why first:** M2 requires a registered HFR facility ID before any record linking
**Skill:** `abdm-m4` (91 operations)

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 1.1 | Fetch master data | Get councils, courses, colleges, states, districts, facility types from HPR/HFR master data APIs | Master data cached locally | `pending` |
| 1.2 | Search facility | `POST /facilitymanagement/v1.5/facility/search` - check if AKOS facility already exists in HFR | Search returns result or empty | `pending` |
| 1.3 | Onboard facility to HFR | Create facility in 3 writes + submit: basic info, services, infrastructure | Facility ID received, status moves to `Submitted` | `pending` |
| 1.4 | Link facility to bridge | `POST /v1/bridges/MutipleHRPAddUpdateServices` with bridgeId, hipName, type=HIP, active=true | Facility linked to AKOS bridge | `pending` |
| 1.5 | Set callback URL | Update Bridge API with AKOS callback URL | Callbacks route to AKOS server | `pending` |
| 1.6 | Create HPID for care navigators | NHPR V4 link-based Aadhaar flow: `POST /aadhaar/generateLink` → user authenticates on ABDM page → poll `isAuthenticated` → `verifyOTP v2` → `checkHpIdAccountExist` → suggestions → `createHprIdWithPreVerified v2`. CN portal wizard complete. URL updated from deprecated `hpridsbx.abdm.gov.in` to `apihspsbx.abdm.gov.in/v4/int`. Doctor/OHC HP-ID: deferred (separate backends). | At least 1 CN has HP-ID linked | `done` 2026-11-26 |
| 1.7 | Register professional profile | Add qualifications, council registration, certificates to HP-ID | Professional profile complete on HPR | `pending` |
| 1.8 | Build admin UI (hr_portal) | Admin page to trigger facility registration and view status | UI functional | `pending` |
| 1.9 | Sandbox functional test | Run M4 test cases (190 cases per NHA workbook) | All mandatory cases pass | `pending` |

**Phase 1 Progress: 0/9 done (0%)**

---

### PHASE 2: M1 - Create & Verify ABHA
**Goal:** Patients can create/verify ABHA and link it to their AKOS account
**Skill:** `abdm-m1` (123 operations, 17 functionalities)

#### 2A. Mandatory Functionalities (Private Entity)

| # | Step | Functionality | Test Cases | Exit Condition | Status |
|---|------|--------------|------------|----------------|--------|
| 2.1 | Create ABHA by Aadhaar OTP | Aadhaar entry -> OTP -> verify -> ABHA created | CRT_ABHA_101-116 | ABHA number returned and stored | `done` |
| 2.2 | Log in with ABHA number | ABHA number -> auth method -> profile | VRFY_ABHA_101, 201 | Profile fetched for existing ABHA | `done` |
| 2.3 | Log in with ABHA address | ABHA address -> auth method -> profile | VRFY_ABHA_102, 202 | Profile fetched by address | `done` |
| 2.4 | Find forgotten ABHA by mobile | Mobile -> OTP -> select account from list | VRFY_ABHA_301-308 | Correct account selected from list | `done` |
| 2.5 | Log in with Aadhaar OTP | Aadhaar -> OTP -> profile access | VRFY_ABHA_401-405 | Aadhaar-based login works | `done` |
| 2.6 | Link one ABHA per patient record | 1:1 mapping enforced: one ABHA number = one patient | TAGGING test case | Duplicate linking rejected | `done` |
| 2.7 | Scan and Share at counter | Patient shows ABHA QR -> facility reads profile | SHARE_701, 702 | QR data parsed and profile populated | `pending` |

#### 2B. Backend Implementation

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 2.8 | M1 Routes & Controller | Create `/api/abdm/m1/*` endpoints for all 7 functionalities (15 endpoints) | Routes registered and responding | `done` |
| 2.9 | ABHA Creation Service | Aadhaar OTP flow: request OTP -> verify OTP -> enrol -> store ABHA number + address | End-to-end creation on sandbox | `done` |
| 2.10 | ABHA Login Service | All 4 login methods (ABHA number, address, Aadhaar OTP, mobile) | Login returns profile on sandbox | `done` |
| 2.11 | ABHA Profile Service | Fetch, cache and display ABHA profile; ABHA card; QR code | Profile read works | `done` |
| 2.12 | ABHA-Patient Linking | Store ABHA in `abdm_abha_accounts`, enforce 1:1 with patient record | Linking persisted in DB | `done` |
| 2.13 | QR Code Reader Service | Parse ABHA QR data, extract profile, populate patient registration | QR data parsed correctly | `done` |

#### 2C. Frontend Implementation

| # | Step | Portal | Description | Exit Condition | Status |
|---|------|--------|------------|----------------|--------|
| 2.14 | Patient Web - ABHA creation | akosMd_patient | Rewrite `GenerateAbhaId.tsx`: consent screen, Aadhaar input, OTP input, success with ABHA card | Full creation flow works | `done` |
| 2.15 | Patient Web - ABHA login | akosMd_patient | Add login-by-ABHA flows to profile page | Login and profile fetch works | `done` |
| 2.16 | Patient Mobile - ABHA creation | akosmd_mobile_app | ABHA creation flow with QR display | Mobile creation works | `pending` |
| 2.17 | Patient Mobile - QR scan | akosmd_mobile_app | Camera QR scanner for Scan-and-Share | QR scan populates profile | `pending` |
| 2.18 | Doctor Portal - ABHA verify | akos-frontend-doctor | During consultation: verify/link patient ABHA | Doctor can verify ABHA | `pending` |
| 2.19 | Care Navigator - assist ABHA | carenavigator | Help patients create/find ABHA | CN can create ABHA for patient | `pending` |
| 2.20 | OHC - counter ABHA scan | akos-frontend-ohc | Scan-and-Share at OHC reception desk | QR scan works at OHC | `pending` |
| 2.21 | Sandbox functional test | All | Run M1 test cases (66 cases per NHA workbook) | All mandatory cases pass | `pending` |

**Phase 2 Progress: 13/21 done (62%) — Backend + Patient Web Portal complete; pending: mobile app, doctor/CN/OHC portals, sandbox functional test**

---

### PHASE 3: M2 - Link Care Contexts & Share Records (HIP)
**Goal:** Every consultation/lab test creates a care context and AKOS can share FHIR records
**Skill:** `abdm-m2` (24 operations)
**Prerequisite:** Phase 1 (facility registered) + Phase 2 (ABHA linked)

#### 3A. FHIR Bundle Generation

| # | Step | Record Type | AKOS Source Data | Exit Condition | Status |
|---|------|------------|------------------|----------------|--------|
| 3.1 | OPConsultation bundle | OPConsultRecord | `appointment` + `prescription` + doctor notes | Valid FHIR bundle passes `validate_fhir` | `done` 2026-11-25 |
| 3.2 | Prescription bundle | PrescriptionRecord | `prescription` + `medicinePrescribed` | Valid FHIR bundle | `done` 2026-11-25 |
| 3.3 | DiagnosticReport bundle | DiagnosticReportRecord | `labOrder` + `labOrderDetails` + report PDF | Valid FHIR bundle | `done` 2026-11-25 |
| 3.4 | WellnessRecord bundle | WellnessRecord | `vitalMonitoring` data | Valid FHIR bundle | `pending` |
| 3.5 | HealthDocumentRecord | HealthDocumentRecord | `patientFile` uploads | Valid FHIR bundle | `pending` |

**FHIR Bundle Mapping (AKOS Data -> FHIR Resources):**

```
AKOS patient         -> FHIR Patient (with ABHA identifiers)
AKOS doctor          -> FHIR Practitioner
AKOS appointment     -> FHIR Encounter
AKOS prescription    -> FHIR MedicationRequest[]
AKOS medicinePrescribed -> FHIR MedicationStatement
AKOS labOrder        -> FHIR DiagnosticReport + Observation[]
AKOS vitalMonitoring -> FHIR Observation (vitals)
AKOS patientDetails  -> FHIR AllergyIntolerance, Condition
```

#### 3B. Care Context Linking

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 3.6 | Generate link token | `POST /v3/hip/generateToken` for patient, store with 6-month TTL | Token stored in `abdm_abha_accounts.link_token` | `done` 2026-11-25 |
| 3.7 | HIP-initiated linking | After consultation: auto-create care context + call `POST /v3/hip/link/carecontext` | Callback confirms link success | `done` 2026-11-25 |
| 3.8 | Auto-link on events | Trigger linking when: appointment completed, prescription created, lab report uploaded | Care contexts created automatically | `pending` |
| 3.9 | Care context naming | Display names with NO clinical info (e.g., "Visit on 23-Nov-2026" not "Diabetes consultation") | Names follow ABDM rules | `done` 2026-11-25 |

#### 3C. Discovery & Data Transfer (HIP Side)

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 3.10 | Handle discovery callback | `POST /v3/hip/patient/discover` - match patient by ABHA, return care contexts | Discovery returns correct contexts | `done` 2026-11-25 |
| 3.11 | Handle user-initiated link | Callbacks for link init + link confirm with OTP | Patient can link from PHR app | `done` 2026-11-25 |
| 3.12 | Handle consent notification | `POST /consent/v3/request/hip/on-notify` - acknowledge consent grant/revoke | Consent acknowledged correctly | `done` 2026-11-25 |
| 3.13 | Handle health info request | Receive data request -> validate consent -> build FHIR bundle -> encrypt (ECDH/Curve25519 + AES-GCM) -> push to dataPushUrl | Encrypted data received by requester | `done` 2026-11-25 |
| 3.14 | Build Fidelius encryption | ECDH key exchange with Curve25519, HKDF key derivation, AES-GCM encryption | Data encrypts/decrypts correctly | `done` 2026-11-25 |
| 3.15 | SMS notification to patient | Notify patient about linked care contexts via ABDM SMS API | SMS callback received | `pending` |

#### 3D. Frontend Integration

| # | Step | Portal | Description | Status |
|---|------|--------|------------|--------|
| 3.16 | Doctor portal auto-link | akos-frontend-doctor | After prescription save -> trigger care context link | `pending` |
| 3.17 | Care navigator view | carenavigator | View linked care contexts per patient | `done` 2026-11-25 — PatientAbdmPage Care Contexts tab |
| 3.18 | Patient view contexts | akosMd_patient | Show linked ABDM care contexts in medical records | `pending` |
| 3.19 | Sandbox functional test | All | Run M2 test cases (13 cases) | `pending` |

**Phase 3 Progress: 12/19 done (63%) — Backend complete (Fidelius, FHIR builders, m2Service, controllers, routes, callbacks wired); CN frontend care contexts view done; pending: auto-link triggers, SMS, doctor portal, patient portal, sandbox test**

---

### PHASE 4: M3 - Health Information Exchange with Consent (HIU)
**Goal:** AKOS doctors can request patient records from other providers with consent
**Skill:** `abdm-m3` (16 operations)
**Prerequisite:** Phase 3 (M2 working)

#### 4A. Consent Request Flow

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 4.1 | Initiate consent request | `POST /consent/v3/request/init` with patient ABHA address, purpose, HI types, date range | Consent request ID received via callback | `done` 2026-11-25 |
| 4.2 | Track consent status | `POST /consent/v3/request/status` -> status callback | Status updates stored in DB | `done` 2026-11-25 |
| 4.3 | Handle consent grant | Callback with artefact IDs (can be multiple - one per HIP) | All artefact IDs stored | `done` 2026-11-25 |
| 4.4 | Fetch consent artefact | `POST /consent/v3/fetch` -> artefact detail callback | Full artefact stored with signature | `done` 2026-11-25 |
| 4.5 | Handle consent revoke | Callback notifying consent revoked -> mark artefact inactive | Revoked consents stop data access | `done` 2026-11-25 |
| 4.6 | Handle consent expiry | Cron job to expire old consents | Expired consents marked inactive | `pending` |

#### 4B. Health Information Fetch

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 4.7 | Request health info | `POST /health-information/v3/request` with consent artefact ID | Request acknowledged via callback | `done` 2026-11-25 |
| 4.8 | Receive encrypted data | Data arrives at dataPushUrl -> decrypt with Fidelius (ECDH) | FHIR bundles decrypted successfully | `done` 2026-11-25 |
| 4.9 | Parse FHIR bundles | Extract clinical data from 8 possible record types | Data stored/displayed correctly | `done` 2026-11-25 |
| 4.10 | Store received records | Save decrypted records with consent reference and expiry | Records queryable by patient | `done` 2026-11-25 |

#### 4C. Frontend Integration

| # | Step | Portal | Description | Status |
|---|------|--------|------------|--------|
| 4.11 | CN - request + view records | carenavigator | Consent request form + received records view per patient | `done` 2026-11-25 — PatientAbdmPage Consent & Records tab |
| 4.12 | Doctor - request records | akos-frontend-doctor | UI to request patient records from other providers | `pending` |
| 4.13 | Doctor - view records | akos-frontend-doctor | Display received FHIR records (formatted) | `pending` |
| 4.14 | Patient - consent dashboard | akosMd_patient | View/manage active consents, see who accessed records | `pending` |
| 4.15 | Patient mobile - consent | akosmd_mobile_app | Consent dashboard on mobile | `pending` |
| 4.16 | Sandbox functional test | All | Run M3 test cases (16 cases) | `pending` |

**Phase 4 Progress: 10/16 done (63%) — Full backend done (consent flow, Fidelius decrypt, FHIR storage, all callbacks wired, m3 routes); CN frontend done; pending: doctor portal, patient portal, mobile, sandbox test**

---

### PHASE 5: End-to-End Testing & Go-Live
**Goal:** All milestones pass NHA functional testing

| # | Step | Description | Exit Condition | Status |
|---|------|------------|----------------|--------|
| 5.1 | Full E2E sandbox test | Create ABHA -> book appointment -> link care context -> request from PHR app -> records appear | Complete flow works | `pending` |
| 5.2 | NHA workbook completion | Fill all test cases in NHA-provided workbook | All mandatory cases pass | `pending` |
| 5.3 | Security audit | Verify: no Aadhaar/OTP in logs, encryption correct, certificate rotation, no hardcoded values | Audit passed | `pending` |
| 5.4 | Performance testing | Test callback handling under load, FHIR bundle generation speed | Acceptable response times | `pending` |
| 5.5 | Switch to production ABDM | Update URLs from sandbox to production gateway | Production calls succeed | `pending` |
| 5.6 | Functional testing agency | NHA-empanelled agency runs formal test | Test report submitted | `pending` |
| 5.7 | Go-live approval | NHA approves AKOS as ABDM participant | Approval received | `pending` |

**Phase 5 Progress: 0/7 done (0%)**

---

## 6. FHIR Record Type Mapping (AKOS -> ABDM)

| ABDM hiType | NRCES Profile | AKOS Trigger Event | AKOS Source Tables |
|-------------|--------------|--------------------|--------------------|
| OPConsultation | OPConsultRecord | Appointment completed | `appointment`, `prescription`, `patientDetails`, `doctor` |
| Prescription | PrescriptionRecord | Prescription saved | `prescription`, `medicinePrescribed`, `medicine`, `doctor` |
| DiagnosticReport | DiagnosticReportRecord | Lab report uploaded | `labOrder`, `labOrderDetails`, `lab`, `labTest` |
| WellnessRecord | WellnessRecord | Vital monitoring entry | `vitalMonitoring`, `patientDetails` |
| HealthDocumentRecord | HealthDocumentRecord | Patient uploads document | `patientFile`, `patientFolder` |
| ImmunizationRecord | ImmunizationRecord | Vaccination recorded | `patientDetails.vaccinations` (JSON) |
| DischargeSummary | DischargeSummaryRecord | (Future - inpatient) | Not currently in AKOS |
| Invoice | InvoiceRecord | Payment completed | `labOrder` (payment), `appointment` (payment) |

---

## 7. API Endpoints Summary (New)

### Internal APIs (Frontend -> Backend)

```
POST   /api/abdm/m1/abha/create/aadhaar/init      # Start Aadhaar OTP
POST   /api/abdm/m1/abha/create/aadhaar/verify     # Verify OTP & create ABHA
POST   /api/abdm/m1/abha/login/abha-number         # Login by ABHA number
POST   /api/abdm/m1/abha/login/abha-address         # Login by ABHA address
POST   /api/abdm/m1/abha/login/aadhaar              # Login by Aadhaar OTP
POST   /api/abdm/m1/abha/find/mobile                # Find ABHA by mobile
POST   /api/abdm/m1/abha/link                       # Link ABHA to patient record
GET    /api/abdm/m1/abha/profile/:patientId          # Get linked ABHA profile
POST   /api/abdm/m1/abha/qr/parse                   # Parse scan-and-share QR

POST   /api/abdm/m2/care-context/link               # Link care context
GET    /api/abdm/m2/care-contexts/:patientId         # List care contexts

POST   /api/abdm/m3/consent/request                  # Request consent
GET    /api/abdm/m3/consent/status/:requestId         # Check consent status
GET    /api/abdm/m3/consent/artefacts/:patientId      # List consent artefacts
GET    /api/abdm/m3/records/:patientId                # Get received health records

POST   /api/abdm/m4/facility/search                  # Search HFR
POST   /api/abdm/m4/facility/register                # Register facility
POST   /api/abdm/m4/facility/link-bridge             # Link to bridge
POST   /api/abdm/m4/professional/create-hpid         # Create HP-ID
POST   /api/abdm/m4/professional/register            # Register professional
```

### Callback APIs (ABDM -> Backend)

```
POST   /api/abdm/callback/v3/hip/patient/discover       # M2: Discovery request
POST   /api/abdm/callback/v3/hip/link/init               # M2: User-initiated link start
POST   /api/abdm/callback/v3/hip/link/confirm             # M2: User-initiated link confirm
POST   /api/abdm/callback/v3/link/on-carecontext          # M2: Link result
POST   /api/abdm/callback/v3/consent/hip/on-notify        # M2: Consent notification (HIP)
POST   /api/abdm/callback/v3/hip/health-information       # M2: Health info request (HIP)
POST   /api/abdm/callback/v3/hiu/consent/on-init          # M3: Consent request accepted
POST   /api/abdm/callback/v3/hiu/consent/on-status        # M3: Consent status update
POST   /api/abdm/callback/v3/hiu/consent/on-notify        # M3: Consent grant/revoke
POST   /api/abdm/callback/v3/hiu/consent/on-fetch         # M3: Consent artefact detail
POST   /api/abdm/callback/v3/hiu/health-information       # M3: Health info acknowledgement
POST   /api/abdm/callback/v3/hiu/data-push                # M3: Encrypted records arrive
```

---

## 8. Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| Never log Aadhaar, OTP, passwords | Sanitize all log middleware for ABDM routes |
| Encrypt identifiers with RSA | Use ABDM public certificate, cache with TTL |
| ECDH for data transfer | Curve25519 keypair, HKDF derivation, AES-GCM |
| Validate callback signatures | Middleware on all callback routes |
| Fresh REQUEST-ID per call | UUID v4 generated and logged before each call |
| UTC timestamps with ms | `new Date().toISOString()` format |
| Certificate rotation | TTL-based cache, auto-refresh on expiry |
| No hardcoded ABDM values | All from .env or fetched from master data APIs |
| Consent enforcement | Check artefact status + date range before sharing any record |

---

## 9. Progress Tracker

| Phase | Steps | Done | % |
|-------|-------|------|---|
| Prerequisites | 7 | 2 | 29% |
| Phase 0: Foundation | 8 | 8 | 100% |
| Phase 1: M4 - Facilities & Professionals | 9 | 0 | 0% |
| Phase 2: M1 - ABHA Creation & Verification | 21 | 13 | 62% |
| Phase 3: M2 - Care Context & Record Sharing | 19 | 0 | 0% |
| Phase 4: M3 - Consent & Health Info Exchange | 15 | 0 | 0% |
| Phase 5: E2E Testing & Go-Live | 7 | 0 | 0% |
| **TOTAL** | **86** | **23** | **27%** |

---

## 10. References

| Resource | URL |
|----------|-----|
| ABDM Developer Portal | https://docs.abdm.gov.in |
| M1 API Reference | https://docs.abdm.gov.in/docs/hiecm/v3/api/m1 |
| M2 API Reference | https://docs.abdm.gov.in/docs/hiecm/v3/api/m2 |
| M3 API Reference | https://docs.abdm.gov.in/docs/hiecm/v3/api/m3 |
| M4 API Reference | https://docs.abdm.gov.in/docs/hiecm/v3/api/m4 |
| FHIR Profiles (NRCeS) | https://docs.abdm.gov.in/docs/hiecm/v3/reference/fhir |
| Error Codes | https://docs.abdm.gov.in/docs/hiecm/v3/reference/error-codes |
| Sandbox Access | https://docs.abdm.gov.in/docs/hiecm/v3/getting-started/sandbox |
| Glossary | https://docs.abdm.gov.in/docs/hiecm/v3/getting-started/glossary |
| ABDM MCP Server | https://docs.abdm.gov.in/mcp |

---

*This plan is updated after every step. Never write tokens, secrets, OTPs, passwords or patient identifiers to this file.*
