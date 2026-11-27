# AKOS — ABDM M4, M2, M3 Features

**For:** Internal product overview
**Backend:** `akospatientapi` (single API for all portals)
**Current status:** M1 patient web portal ✅ Done. M4 → M2 → M3 is the next sequence.

---

## Why this sequence?

```
M4 (Register facility on ABDM)
  └─→ gives us HFR ID
        └─→ M2 (Link patient records to ABDM network) works
              └─→ M3 (Pull patient records from other hospitals with consent) works
```

None of M2 or M3 works without M4 first.

---

---

# M4 — Facility & Doctor Registration on ABDM

## What it is
AKOS ko apni clinic/OHC ko ABDM ke national registry mein register karna hai.
Jaise Aadhaar ek national ID hai humans ke liye, **HFR ID ek national ID hai
healthcare facilities ke liye**. Doctors ka bhi national ID banta hai — HP-ID.

## Why it matters
Bina HFR ID ke AKOS ko ABDM network pe koi nahi jaanta. Patients AKOS se linked
records doosri jagah nahi dekh paenge. M2 start nahi hoga.

---

## M4 Features — Facility Registration (HFR)

### Admin kya kar paega
One-time setup. AKOS admin ABDM ke sandbox/production portal pe:

| Feature | Description |
|---------|-------------|
| **Facility search** | Pehle check karo AKOS already registered hai kya HFR mein |
| **Register facility** | Facility naam, address (LGD codes), contact, ownership type, system of medicine, facility type, working hours, specialities, bed count register karo |
| **Upload facility photos** | Facility board photo, building photo |
| **Additional info** | Pharmacy hai kya, diagnostic lab hai kya, blood bank hai kya, imaging center hai kya, linked programs (PMJAY ID, ROHINI ID, etc.) |
| **Submit for approval** | ABDM NHA team review karega → HFR ID milega |
| **Bridge link** | HFR ID milne ke baad AKOS ke callback URL se link karo — 1 API call, done |

**Result:** `ABDM_HFR_ID` aur `ABDM_HIP_ID` `.env` mein set hota hai → M2 enabled.

---

## M4 Features — Doctor HP-ID (HPR)

### Doctor kya kar paega (ya admin unke liye)

| Feature | Description |
|---------|-------------|
| **HP-ID creation** | Doctor Aadhaar OTP se apna national Health Professional ID banata hai (e.g., `dr.sharma@hpr.abdm`) |
| **Professional profile** | Medical council registration number, degree (MBBS/MD), college, university, speciality, current workplace fill karo |
| **Mobile + email verify** | OTP se contact verify hota hai |
| **Upload documents** | Medical council certificate, degree certificate upload |
| **HP-ID card** | QR code wala digital ID card milta hai |
| **Search/find** | Kisi doctor ka HP-ID search kar sako HPR number se ya mobile se |

**Who does it:** Each AKOS doctor once. Admin assist kar sakta hai.

---

## M4 — Summary

| What | Who | When | Effort |
|------|-----|------|--------|
| Facility HFR registration | AKOS admin | One-time | Manual on ABDM portal (or via API) |
| Bridge URL link | AKOS DevOps | One-time | 1 API call after HFR approved |
| Doctor HP-ID | Each AKOS doctor | One-time per doctor | Aadhaar OTP flow, 10 min |

**No new portal UI needed.** Admin does it manually or through ABDM's own portal.

---

---

# M2 — Care Context Linking & Record Sharing

## What it is
Jab bhi patient AKOS pe koi health event hota hai (appointment complete, prescription
save, lab report upload, OHC visit), AKOS automatically ABDM network ko batata hai:
**"Is patient ke yahan records hain mere paas."**

Patient baad mein apne ABHA app (NHA's app) se dekh sakta hai ki uske records kahaan
kahaan hain — aur kisi bhi doctor ke saath consent de sakta hai unhe share karne ke liye.

## Why it matters
Iske bina AKOS ke records ek closed system mein hain. ABDM ke saath link hone ke baad
koi bhi ABDM-connected doctor (doosre hospital mein bhi) patient ki consent se AKOS
ka record dekh sakta hai. **Ye India ka national health record network hai.**

---

## M2 Features — Backend (Auto, No User Action Needed)

Ye sab automatic hoga — doctor/OHC staff ko kuch alag nahi karna padega.

| Event | What ABDM gets notified |
|-------|------------------------|
| Appointment marked "Completed" | Care context: `"OPD visit on 24-Nov-2026"` linked |
| Prescription saved | Care context: `"Prescription — 24-Nov-2026"` linked |
| Lab report uploaded | Care context: `"Lab report — 24-Nov-2026"` linked |
| OHC OPD visit saved | Care context: `"OHC visit on 24-Nov-2026"` linked |
| Vitals entry saved | Care context: `"Wellness record — Nov 2026"` linked |
| Patient uploads document | Care context: `"Health document — Nov 2026"` linked |

**Care context mein kya hota hai:**
- Reference number: `AKOS-APPT-12345` (internal ID)
- Display name: `"OPD visit on 24-Nov-2026"` — **koi clinical info nahi** (no diagnosis name, no test name — ABDM rule)
- Record type: OPConsultation / Prescription / DiagnosticReport / WellnessRecord / HealthDocumentRecord

**FHIR Bundles:** Har record type ke liye AKOS data se standard FHIR bundle banta hai
(international health record format jo ABDM use karta hai).

**Encryption:** Jab koi doosra doctor consent ke saath record maange, AKOS Fidelius
encryption (ECDH Curve25519 + AES-256-GCM) se encrypt karke bhejta hai. Only the
requesting doctor can decrypt it.

---

## M2 Features — Doctor Portal

| Feature | Where | What doctor sees |
|---------|-------|-----------------|
| **ABDM link status badge** | Appointment Details page | "ABDM Linked ✓" ya "Linking pending…" ya "Link failed ✗" badge on appointment card |
| **Care context list** | Appointment Details page | List of all records linked for this patient on ABDM |
| **Auto-link on completion** | Auto — no manual step | Jaise hi doctor appointment complete karta hai, background mein ABDM linking hoti hai |

---

## M2 Features — OHC Portal

| Feature | Where | What OHC staff sees |
|---------|-------|---------------------|
| **Auto-link on OPD save** | OPD Add page | OPD submit karne ke baad "ABDM linking…" status dikhega |
| **Link status** | OPD records list | Har OPD visit ke liye ABDM link status column |

---

## M2 Features — Patient Web Portal

| Feature | Where | What patient sees |
|---------|-------|------------------|
| **ABDM Records tab** | Medical Records section | New tab: "ABDM Linked Records" — list of all visits/records visible on ABDM network |
| **Record details** | Each record | Date, type (OPD/Prescription/Lab), linked status |

---

## M2 Features — Patient Mobile App

| Feature | Where | What patient sees |
|---------|-------|------------------|
| **ABDM Records** | Medical Records screen | Same as web — ABDM linked records tab |
| **Notification** | Push notification | "Your OPD record from AKOS has been linked to ABDM" |

---

## M2 — Discovery & Incoming Requests (Backend Only)

Ye tab hota hai jab patient doosre hospital se apna AKOS record mangwata hai:

| Scenario | What happens |
|----------|-------------|
| Patient apne ABHA app se AKOS record dhundta hai | ABDM → AKOS ko "discovery" request bhejta hai → AKOS patient ke care contexts return karta hai |
| Patient link confirm karta hai | ABDM → AKOS ko link confirm karta hai → record linked ho jaata hai |
| Doosra hospital consent ke saath record maangta hai | ABDM → AKOS ko request aata hai → AKOS FHIR bundle encrypt karke bhejta hai |
| Consent revoke/expire hoti hai | AKOS record sharing automatically band |

**Ye sab backend callbacks hain — kisi portal mein UI nahi chahiye.**

---

## M2 — Summary

| What | Portal | Type |
|------|--------|------|
| Auto care-context link on appointment completion | Doctor Portal (auto) | Backend + status badge |
| Auto care-context link on OPD save | OHC Portal (auto) | Backend + status indicator |
| ABDM Records tab | Patient Web + Mobile | View only |
| FHIR bundle generation for 6 record types | Backend | Auto |
| Fidelius encryption for outgoing records | Backend | Auto |
| Discovery + incoming link callbacks | Backend | Auto |

---

---

# M3 — Consent & Health Information Exchange (HIU)

## What it is
AKOS as a **HIU (Health Information User)** — matlab AKOS ke doctors doosre hospitals
mein patient ke records maang sakte hain, **patient ki consent ke saath**.

Example: Patient pehle Fortis mein gaya tha. Ab AKOS ke doctor ke paas aaya hai.
Doctor ABDM se request karta hai → Patient ke phone pe notification aata hai →
Patient "Allow" karta hai → Fortis ke records AKOS doctor ke paas aa jaate hain.

---

## M3 Features — Doctor Portal

| Feature | Where | Description |
|---------|-------|-------------|
| **Request External Records** | Appointment Details page | Button: "Get patient's records from other providers" |
| **Consent form** | Modal/page | Doctor selects: purpose (Diagnosis/Treatment/etc.), record types (OPConsultation, DiagnosticReport, etc.), date range (from when to when), expiry date |
| **Consent status** | Appointment Details | Live status: Requested → Patient approved → Records fetching → Records received |
| **View external records** | Appointment Details | Received FHIR records rendered nicely: visit details, prescriptions, lab reports from other hospitals |
| **Multiple artefacts** | Auto-handled | Patient may have records in 3 hospitals — all 3 respond separately, all shown |

---

## M3 Features — Patient Web Portal

| Feature | Where | Description |
|---------|-------|-------------|
| **Consent Dashboard** | New section in Profile / My Health | List of all active consents: who has access, what data, till when |
| **Consent detail** | Per consent | Doctor name, hospital, data types shared, date range, expiry |
| **Revoke consent** | Per consent | "Revoke" button — doctor immediately loses access |
| **Consent history** | Tab | Past consents (approved, denied, expired, revoked) |

---

## M3 Features — Patient Mobile App

| Feature | Where | Description |
|---------|-------|-------------|
| **Push notification** | System tray | "Dr. Sharma from AKOS has requested your health records. Tap to review." |
| **Consent approval** | In-app screen | Patient sees who is requesting, what data, for how long → Approve / Deny |
| **Consent Dashboard** | My Account section | Same as web — active consents list with revoke option |

---

## M3 Backend (Invisible to users)

| What | Description |
|------|-------------|
| **Consent request API** | `POST /consent/v3/request/init` → ABDM sends request to patient's PHR app |
| **Consent status polling** | `POST /consent/v3/request/status` → check if patient approved |
| **Consent grant callback** | ABDM notifies AKOS when patient approves → artefact IDs received |
| **Fetch artefact** | `POST /consent/v3/fetch` → get full consent artefact with signature |
| **Request health info** | `POST /health-information/v3/request` → ask HIPs to send records |
| **Receive encrypted data** | FHIR bundles arrive at AKOS dataPushUrl → decrypt with Fidelius → store |
| **Parse FHIR bundles** | Extract clinical data from 8 possible record types |
| **Consent expiry** | Cron job → expired consents automatically deactivated |
| **Revoke handling** | Callback when patient revokes → access cut immediately |

---

## M3 — Summary

| What | Portal | Type |
|------|--------|------|
| Request external records | Doctor Portal | New button in appointment |
| View received external records | Doctor Portal | Rendered FHIR data |
| Consent dashboard | Patient Web + Mobile | Manage active consents |
| Push notification on consent request | Patient Mobile | Background notification |
| Consent approval / deny | Patient Mobile | In-app screen |
| All backend consent + data fetch flow | Backend | Auto |

---

---

# Full Feature Summary — All 3 Milestones

## Per Portal

| Portal | M4 | M2 | M3 |
|--------|----|----|-----|
| **Admin (AKOS internal)** | Facility HFR registration, Bridge link | — | — |
| **Doctor Portal** | Doctor HP-ID | Auto-link badge, care context status, View linked records | Request external records, View received records |
| **OHC Portal** | — | Auto-link on OPD save, link status | — |
| **Care Navigator** | — | View patient's care contexts | — |
| **Patient Web** | — | ABDM Records tab | Consent dashboard, revoke |
| **Patient Mobile** | — | ABDM Records tab, push notification | Consent approval, consent dashboard |
| **HR Portal** | — | ABDM linked status per employee | — |
| **Backend (API)** | Bridge link API | FHIR builders (6 types), Fidelius encryption, care-context auto-trigger, discovery callbacks | Consent flow, data fetch, decrypt, FHIR parse |

---

## Total New Screens / Components to Build

| Portal | New Screens/Components | M-Level |
|--------|------------------------|---------|
| Doctor Portal | ABDM link badge, care context list, request records modal, external records view | M2 + M3 |
| OHC Portal | Link status indicator on OPD | M2 |
| Patient Web | ABDM Records tab, Consent Dashboard | M2 + M3 |
| Patient Mobile | ABDM Records screen, Consent screen, Push notification | M2 + M3 |
| Care Navigator | Patient ABDM records view | M2 |
| HR Portal | Employee ABDM link status column | M2 |
| Backend | FHIR builders ×6, Fidelius service, M2 auto-trigger, M3 consent flow, decrypt service | M2 + M3 |

---

## Effort View (Rough)

| Milestone | Backend | Frontend | Notes |
|-----------|---------|----------|-------|
| M4 | 1 bridge link API call | None | Admin does manually on ABDM portal |
| M2 | High — FHIR, Fidelius, callbacks | Medium — badges + records tab | Most complex technically |
| M3 | High — consent flow, decrypt | Medium — consent dashboard, approval | Depends on M2 being complete |

---

*Never write tokens, secrets, OTPs or patient identifiers to this file.*
*Last updated: 2026-11-25*
