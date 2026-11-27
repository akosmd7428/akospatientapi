# AKOS Platform — ABDM Integration Per Portal

**Date:** 2026-11-24
**Backend:** `akospatientapi` (Node.js/Express) — single API for all portals

---

## 1. AKOS Platform Overview

AKOS is a B2B corporate healthcare SaaS. It ties up with companies and provides
healthcare facilities to their employees. AKOS has its own doctors, its own OHC
centres, and its own care navigators.

```
Admin Portal (Laravel) ← AKOS internal only, central management
        ↓ manages
┌─────────────────────────────────────────────────────────────┐
│  Portal          │  Who uses it          │  Tech            │
├─────────────────────────────────────────────────────────────┤
│  Patient Web     │  Employees / patients │  React + Redux   │
│  Patient Mobile  │  Employees / patients │  React Native    │
│  Doctor Portal   │  AKOS doctors         │  React + Redux   │
│  Care Navigator  │  AKOS CN staff        │  React + Redux   │
│  OHC Portal      │  OHC staff            │  React + Redux   │
│  HR Portal       │  Company HR managers  │  React + Redux   │
│  Mchemist        │  Pharmacy             │  React + RTK     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. What Each Portal Does (Current Features)

---

### 2.1 Patient Web Portal (`akosMd_patient`) — React + Redux

**Users:** Employees / patients of AKOS client companies

| Module | Features |
|--------|----------|
| **Dashboard** | Health overview, risk map, vital snapshot, care team notes |
| **Appointments** | Book (call/video/in-person), My Appointments list, Appointment Details (chief complaints, prescribed medicine, files), Talk to Doctor, Call Now (OpenTok video) |
| **Vital Monitoring (RPM)** | Live vitals tracking, RPM alert details, manual vital entry, Omron Bluetooth device integration, Add by devices |
| **Lab Tests** | Browse tests, book lab test, lab cart, cart summary, booked lab details |
| **Medical Records** | View medical history, saved documents, upload prescription, PDF viewer |
| **Health Assessments** | HRA (Health Risk Assessment), Behavioural Health tests, Assessment tests, view results |
| **Pharmacy** | Medication ordering via MChemist integration |
| **My Medicines** | View current prescriptions and medicine list |
| **Care Team** | View care team, create care team, manage members |
| **Care Plan** | Personalised care plan view |
| **Chat / Inbox** | Real-time WebSocket chat with doctor |
| **Profile** | Edit profile, change password |
| **ABHA** | **Create (Aadhaar OTP wizard), Login (4 methods), Link/Unlink to account — ✅ DONE** |

---

### 2.2 Patient Mobile App (`akosmd_mobile_app`) — React Native

**Users:** Same patients, on Android/iOS

**Bottom Nav Tabs:**

| Tab | Screens & Features |
|-----|--------------------|
| **Home** | Quick links: appointments, vitals, medicines, lab tests, consultation |
| **Care** | Care team list, create care team, care plan |
| **Dashboard** | Vitals dashboard, vital detail screen, vital history/trends, add manual vitals, device details, add by devices (Omron BT) |
| **Assessment** | Assessment list, take test, view result, Behaviour Health test/result, HRA result |
| **My Account** | Profile, saved documents, PDF viewer, notifications, help, settings |

**Other screens:**
- **Appointments:** My appointments (upcoming/completed/cancelled), appointment details, book appointment, select date-time, doctor detail
- **Lab Tests:** Browse, lab test details, lab cart, lab booking details, cart summary, upload prescription
- **Consultation:** Call Now (video), inbox, chat screen
- **Pharmacy:** MChemist WebView (embedded)
- **My Medicine:** Medicine tracking
- **Auth:** Login, OTP, forgot/reset password, choose user, app intro

**Integrations:** OpenTok video calls, Razorpay payments, Omron Bluetooth, WebSocket chat

---

### 2.3 Doctor Portal (`akos-frontend-doctor`) — React + Redux

**Users:** AKOS's own doctors

| Page | Features |
|------|----------|
| **Dashboard** | My patients count, pending chats, monthly/yearly patient & appointment bar charts, quick actions |
| **My Appointments** | Upcoming/past appointments list with status filters |
| **Appointment Details** | Chief complaints tab, prescribed medicines tab, attached files/documents, patient health score |
| **My Patients** | Full patient list with search and filters |
| **Availability** | Set weekly availability: days, time slots, consultation type (call/video/in-person) |
| **Call Now** | OpenTok-based video consultation, incoming call list |
| **Chat** | Real-time WebSocket messaging with patients |
| **Saved Documents** | View/download prescription PDFs and uploaded files |
| **Prescription Tool** | External URL opens prescription creation app (passes email + JWT token) |
| **Profile** | Edit personal info, profile photo |
| **Settings** | Account preferences |

---

### 2.4 OHC Portal (`akos-frontend-ohc`) — React + Redux

**Users:** OHC (Occupational Health Center) staff at client company premises

| Module | Features |
|--------|----------|
| **Dashboard** | Module-wise access control, quick stats overview |
| **OPD** | Add OPD visit (vitals: BP, temp, sugar, pulse, BMI; diagnosis; symptoms; allergies; medicines dispensed; doctor OPD data; incident register; consumption register; rest register; employee details), OPD records list with filters |
| **Patients** | Add patient, patient details view, patient list |
| **Inventory** | Add inventory items, stock list, carry-forward management, quantity tracking |
| **Equipment** | Add equipment, equipment list, maintenance tracking |
| **First Aid** | Log first aid cases, first aid list |
| **Ambulance** | Pre-journey checklist, ambulance utilization log, records |
| **Bio-Medical Waste (BMW)** | Log BMW entries, BMW records |
| **Handover** | Daily shift handover records, add handover entry |
| **Laundry** | Laundry log, add laundry entry |
| **Medical Rooms** | Room status and management, add medical rooms |
| **Sterilization** | Sterilization log, add sterilization entry |
| **Training** | Staff training records, add training entry |
| **Doctor Call** | Teleconsultation with AKOS doctors (video) |
| **Profile / Settings** | Staff profile management |

---

### 2.5 Care Navigator Portal (`carenavigator/akos-frontend-cnavigator`) — React + Redux

**Users:** AKOS's own Care Navigator staff (coordinate patient care remotely)

| Page | Features |
|------|----------|
| **Dashboard** | CN overview: assigned patients, pending tasks, vital alert summary |
| **All Patients** | Browse all patients in the system with search and filters |
| **My Patient** | Assigned patient list, patient detail view, patient health data |
| **My Appointments** | View patient appointments, appointment details |
| **Lab Tests** | Lab test list, lab test details per patient, track ordered tests |
| **Health Checkups** | Manage health checkup schedule: Requested, Scheduled, Collected, Report Received, Cancelled tabs; upload lab reports |
| **Doctor Chat** | Real-time chat with AKOS doctors |
| **Patient Chat** | Real-time chat with assigned patients |
| **RPM Alert Management** | Monitor vital alerts from RPM devices: list of alerts, alert details, threshold breaches |
| **RPM Alert Details** | Individual alert deep-dive with patient vitals history |
| **Profile / Settings** | CN profile management |

---

### 2.6 HR Portal (`hr_portal_akos`) — React + Redux

**Users:** Company HR managers (each client company gets access)

| Module | Features |
|--------|----------|
| **Employee Management** | Add/edit/enable/disable employees, approval workflow, employee list with filters, bulk actions |
| **Health Checks** | Pre-employment & periodic health checkup tracking, status (scheduled/done/pending), pie chart analytics, date filters |
| **HRA (Health Risk Assessment)** | Employee HRA submission tracking, risk category view, analytics |
| **Doctor Consultation** | Track employee consultations (call/video/in-person), consultation stats |
| **OHC Management** | View OHC activity for their company: OPD visits, inventory usage, ambulance log |
| **Health Risk Analysis** | Risk analysis dashboard with charts — categorise employees by risk level |
| **Test Results** | Employee lab test result tracking with date filters |
| **Engagement** | Employee engagement programs and participation metrics |
| **Wellness Program** | Wellness initiative management and tracking |
| **Pharmacy** | Pharmacy services view, medicine dispensed to employees |
| **Health Coach Program** | Employee health coaching program management |
| **Profile / Settings** | HR user profile |

---

## 3. M4 — Facility & Professional Registration

**Who does it:** AKOS admin (not any user-facing portal)
**When:** One-time setup before M2 goes live

### What needs to happen

| Step | Action | Done by | How |
|------|--------|---------|-----|
| A | Register AKOS facility on HFR | AKOS Admin | ABDM sandbox portal (`facility.abdm.gov.in`) OR via API |
| B | Get HFR ID | Auto after approval | Set `ABDM_HFR_ID` and `ABDM_HIP_ID` in `.env` |
| C | Doctor creates HP-ID | Each AKOS doctor | ABDM portal (`hpr.abdm.gov.in`) OR via API |
| D | Set callback URL | AKOS DevOps | Set `ABDM_BRIDGE_URL` in `.env` |
| E | Bridge link API call | One-time code call | `POST /v1/bridges/MutipleHRPAddUpdateServices` |

### After Step E → M2 is unlocked

**Currently in `.env`:**
```
ABDM_HFR_ID=       ← empty, needs facility registration
ABDM_HIP_ID=       ← empty
ABDM_BRIDGE_URL=   ← empty, needs public HTTPS URL
ABDM_BRIDGE_ID=    ← empty
```

### No new portal needed for M4
M4 is an admin/DevOps task. It does not require UI in any portal.
If needed in future, it can be added to the Laravel Admin portal.

---

## 4. M1 — ABHA Creation & Verification

**Backend:** Already complete (`/api/abdm/m1/*` — 15 endpoints)

### Per Portal Work

#### 4.1 Patient Web Portal ✅ DONE
- ABHA creation wizard (Aadhaar OTP → 5 steps)
- ABHA login (ABHA number / address / Aadhaar OTP / mobile OTP)
- Profile card on Profile page
- Link / Unlink ABHA to patient account

#### 4.2 Patient Mobile App — PENDING
**Where:** `Profile.tsx` screen (MyAccount section)

**What to build:**
- Same ABHA creation flow as web (Aadhaar OTP wizard)
- ABHA login flow
- Show linked ABHA info on profile
- **QR Code display** after ABHA creation/login (patient shows this at OHC counter)

**Key screen:** `AuthScreens/Profile.tsx`
**New screens to add:**
```
screens/AuthScreens/AbhaCreate.tsx   — creation wizard
screens/AuthScreens/AbhaLogin.tsx    — login wizard
screens/AuthScreens/AbhaCard.tsx     — QR + card display
```

#### 4.3 Doctor Portal — PENDING
**Where:** `AppointmentDetails.tsx` — during consultation

**What to build:**
- When doctor opens an appointment, show patient's ABHA status
- If ABHA linked: show ABHA number + "Verify" button
- If not linked: show "Patient has no ABHA" info message
- No creation flow here (doctor does not create ABHA for patient)

**Key screen:** `AuthPages/AppointmentDetails.tsx`
**New component:**
```
components/abha/PatientAbhaStatus.tsx  — small widget in appointment
```

#### 4.4 Care Navigator Portal — PENDING
**Where:** `MyPatient.tsx` — when viewing a patient's details

**What to build:**
- Help patient create ABHA (full creation wizard, CN fills it on behalf of patient)
- Help patient login to existing ABHA
- View patient's linked ABHA status
- CN enters patient's Aadhaar (with patient consent) and completes the OTP flow

**Key screen:** `AuthPages/MyPatient.tsx` or `AllPatient.tsx`
**New components:**
```
components/abha/AbhaAssistWizard.tsx  — CN-assisted ABHA creation
```

#### 4.5 OHC Portal — PENDING (Scan & Share)
**Where:** `AddPatient.tsx` or `OpdAdd.tsx` — when registering a walk-in patient

**What to build:**
- "Scan ABHA QR" button on Add Patient / OPD Add screen
- Camera / QR scanner opens
- Patient shows QR from their ABHA app or AKOS mobile app
- QR parsed → patient name, ABHA number, mobile auto-filled in form

**Key screens:** `AuthPages/AddPatient.tsx`, `AuthPages/OpdAdd.tsx`
**Backend endpoint (already exists):** `POST /api/abdm/m1/qr/parse`
**New component:**
```
components/abha/AbhaQrScanner.tsx  — camera QR scanner + result display
```

---

## 5. M2 — Care Context Linking

**Prerequisite:** M4 done (HFR ID set) + patient has ABHA linked

**Core idea:** Every AKOS health event creates a "care context" on ABDM so the
patient can access their records from any ABDM-connected app.

### Per Portal Work

#### 5.1 Doctor Portal — PENDING (most important)
**When:** After doctor completes a consultation / prescription is saved

**What to build (backend auto-trigger):**
```
Appointment marked "Completed"
    ↓
akospatientapi: check if patient has ABHA linked
    ↓ yes
Create care context:
  referenceNumber: "AKOS-APPT-{appointmentId}"
  display:         "OPD visit on {date}"   ← NO diagnosis name
  hiType:          OPConsultation / Prescription
    ↓
POST /v3/token/generate-token (get link token)
    ↓ (callback)
POST /v3/hip/link/carecontext (link it)
    ↓ (callback)
Save in abdm_care_contexts table
```

**What to build (frontend — Doctor Portal):**
- In Appointment Details: show "ABDM Linked" badge if care context exists
- No manual action required by doctor (auto on completion)
- Status indicator: Pending / Linked / Failed

**Key screen:** `AuthPages/AppointmentDetails.tsx`

#### 5.2 OHC Portal — PENDING
**When:** OPD visit saved (`OpdAdd.tsx` on submit)

**Same auto-trigger pattern:**
```
OPD visit saved
    ↓
Create care context: "AKOS-OPD-{opdId}", "OHC visit on {date}"
    ↓
Link via M2 API
```

**Key screen:** `AuthPages/OpdAdd.tsx` (after successful submit)

#### 5.3 Patient Portal — PENDING (view only)
**Where:** Medical Records section

**What to build:**
- New tab "ABDM Records" in medical records
- List all linked care contexts with date + display name
- Status: Linked / Pending

#### 5.4 Backend — FHIR Bundle Generation (most complex part)

For each record type, build a FHIR bundle:

| AKOS Source | FHIR Type | Tables Used |
|-------------|-----------|-------------|
| Appointment + prescription | OPConsultation | `appointment`, `prescription`, `medicinePrescribed` |
| Prescription only | PrescriptionRecord | `prescription`, `medicinePrescribed` |
| Lab order + report | DiagnosticReport | `labOrder`, `labOrderDetails` |
| OHC OPD visit | OPConsultation | `ohcOpd` table |
| Vitals | WellnessRecord | `vitalMonitoring` |
| Uploaded document | HealthDocumentRecord | `patientFile` |

#### 5.5 Data Transfer Encryption (Fidelius)
When another HIU requests records with consent:
```
ABDM → callback → AKOS backend
AKOS:
  1. Validate consent artefact
  2. Build FHIR bundle
  3. Fidelius encrypt (ECDH Curve25519 + AES-256-GCM)
  4. POST encrypted data to dataPushUrl
```
Library: [fidelius-cli](https://github.com/mgrmtech/fidelius-cli) — Node.js examples available

---

## 6. M3 — Consent & Health Info Exchange (HIU)

AKOS as HIU: doctors can request patient's records from OTHER hospitals with consent.

### Per Portal Work

#### 6.1 Doctor Portal — PENDING
**When:** Doctor needs patient's history from another hospital

**What to build:**
- "Request External Records" button in Appointment Details
- Select purpose (Diagnosis, Treatment, etc.)
- Select HI types (OPConsultation, DiagnosticReport, etc.)
- Set date range
- Submit → consent request sent to patient's PHR app
- Patient approves on their ABHA app
- Records arrive back → show in appointment

**Key screen:** `AuthPages/AppointmentDetails.tsx`

#### 6.2 Patient Portal — PENDING (consent dashboard)
**Where:** New section in profile / medical records

**What to build:**
- List active consents (who has access, what data, till when)
- Revoke consent button
- History of past consents

#### 6.3 Patient Mobile App — PENDING
- Same consent dashboard as web
- Push notification when consent is requested

---

## 7. Summary Table — What Each Portal Needs to Build

| Portal | M1 | M2 | M3 | M4 |
|--------|----|----|----|----|
| **Patient Web** | ✅ Done | View linked contexts | Consent dashboard | — |
| **Patient Mobile** | ABHA create + QR | View contexts | Consent + notifications | — |
| **Doctor Portal** | ABHA status widget | Auto-link badge + status | Request records | — |
| **Care Navigator** | Assist ABHA creation | View contexts | — | — |
| **OHC Portal** | QR scanner (Scan&Share) | Auto-link on OPD save | — | — |
| **HR Portal** | ABHA status per employee | View linked contexts | — | — |
| **Admin (Laravel)** | — | — | — | Facility HFR registration |
| **Backend (API)** | ✅ Done | FHIR builders + Fidelius | Consent flow + decrypt | Bridge link API |

---

## 8. Build Order (Recommended)

```
Step 1: M4 Admin setup
   └── Admin manually registers facility on ABDM sandbox portal
   └── Set ABDM_HFR_ID, ABDM_HIP_ID, ABDM_BRIDGE_URL in .env
   └── Run bridge link API (1 call)

Step 2: M1 remaining portals
   ├── OHC Portal: QR scanner (Scan & Share)
   ├── Care Navigator: Assisted ABHA creation
   ├── Doctor Portal: ABHA status widget
   └── Mobile App: ABHA create + login + QR display

Step 3: M2 backend
   ├── FHIR bundle builders (OPConsultation, Prescription, DiagnosticReport)
   ├── Fidelius encryption service
   ├── Auto care-context trigger on appointment completion
   └── Auto care-context trigger on OHC OPD save

Step 4: M2 frontend
   ├── Doctor Portal: auto-link status badge
   ├── OHC Portal: auto-link on OPD save
   └── Patient Portal: ABDM records tab

Step 5: M3
   ├── Doctor Portal: request external records
   └── Patient Portal/Mobile: consent dashboard

Step 6: NHA Sandbox Testing
   ├── M1: 66 test cases
   ├── M2: 13 test cases
   ├── M3: 16 test cases
   └── M4: 190 test cases
```

---

## 9. Files to Create Per Portal (Quick Reference)

### Patient Mobile App
```
src/screens/AuthScreens/AbhaCreate.tsx
src/screens/AuthScreens/AbhaLogin.tsx
src/screens/AuthScreens/AbhaCard.tsx
```
Modify: `Profile.tsx`

### Doctor Portal
```
src/components/abha/PatientAbhaStatus.tsx
src/components/abha/CareContextStatus.tsx
```
Modify: `AppointmentDetails.tsx`

### Care Navigator Portal
```
src/components/abha/AbhaAssistWizard.tsx
```
Modify: `MyPatient.tsx`, `AllPatient.tsx`

### OHC Portal
```
src/components/abha/AbhaQrScanner.tsx
src/components/abha/CareContextStatus.tsx
```
Modify: `AddPatient.tsx`, `OpdAdd.tsx`

### HR Portal
```
src/components/abha/EmployeeAbhaStatus.tsx
```
Modify: `ManageEmploye.tsx`

### Backend (akospatientapi)
```
abdm/services/fhirService.js         ← FHIR bundle builders
abdm/services/fidelisService.js      ← Fidelius encryption
abdm/services/m2Service.js           ← Care context linking (extend)
abdm/services/m3Service.js           ← Consent flow (extend)
abdm/fhir/builders/opConsultation.js
abdm/fhir/builders/prescription.js
abdm/fhir/builders/diagnosticReport.js
abdm/fhir/builders/wellnessRecord.js
```

---

*Never write tokens, secrets, OTPs, passwords or patient identifiers to this file.*
*Last updated: 2026-11-24*
