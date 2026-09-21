# SEC-013 — Mass assignment: whole request bodies written to models

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 8.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A08:2021 – Software and Data Integrity Failures; A04:2021 – Insecure Design |
| OWASP ASVS 4.0.3 | V5.1.2 – Protection against mass assignment; V5.1.1 – Input validated against a positive allow-list |
| CWE | CWE-915 – Improperly Controlled Modification of Dynamically-Determined Object Attributes |
| Status | Open |
| Affected component | `services/labTestService.js`, `services/patientService.js`, `controllers/labTestController.js`, `controllers/patientController.js`, `validation/labOrderValidation.js` |

## Summary

Several handlers pass the entire request body into a Sequelize `create` or `update` with no field allow-list. Because Sequelize maps any matching property to its column, a client can set fields the UI never exposes — payment status, order totals, active flags, and the owning `patientId`.

The Joi schemas that would have prevented this exist but are **not applied**: `validation/labOrderValidation.js` is imported under the wrong export name and silently resolves to `undefined`, and the profile schema is commented out. The protection was written and then disconnected.

The most damaging combination is `PatientDetail.update(data, { where: { patientId: data.patientId } })` — the body supplies both the values *and* the target row, so one request can rewrite any patient's clinical record.

## Affected code

### Lab orders — the whole body becomes the row

`controllers/labTestController.js:162-164`:

```js
static async createLabOrder(req, res) {
    const labOrder = await LabTestService.createLabOrder(req.body);     // entire body
```

`services/labTestService.js:1504-1517`:

```js
static async createLabOrder(data) {
    const { orderDetails, ...orderData } = data;
    const labOrder = await LabOrder.create(orderData, { transaction });          // :1509  everything except orderDetails
    const labOrderDetails = orderDetails.map(detail => ({ ...detail, labOrderId: labOrder.id, ... }));   // :1511-1515
    await LabOrderDetails.bulkCreate(labOrderDetails, { transaction });
```

The route applies no validation:

```js
// routes/labTestRoutes.js:7
const { labOrderValidation } = require('../validation/labOrderValidation');   // resolves to undefined
// routes/labTestRoutes.js:23
router.post('/order', jwtAuth, LabTestController.createLabOrder);             // no validateSchema
```

`validation/labOrderValidation.js` exports `{ createLabOrderSchema }`, not `labOrderValidation`. The destructured import yields `undefined`, the variable is never used anywhere, and no error is raised — the file is dead code. See [SEC-027](SEC-027-broken-and-missing-validation.md).

### Patient clinical details — body selects both values and target

`services/patientService.js:945-948`:

```js
static async updateProfile(data) {
    await PatientDetail.update(data, { where: { patientId: data.patientId } });
}
```

`services/patientService.js:1128-1131` — identical shape in `updateNotes`.

Callers pass the raw body — `controllers/patientController.js:387` (`PatientService.updateProfile(req.body)`) and `:408` (`updateNotes(req.body)`) — with only a presence check on `patientId`. Routes `routes/patientProfileRoutes.js:13,15` carry no `validateSchema`; the `profileSchema` import at `:4-5` is commented out.

### Prescription details

`services/patientService.js:616,620` — `existingPrescription.update(prescriptionDetail)` and `PatientPrescriptionDetails.create(prescriptionDetail)`, fed by the **unauthenticated** `POST /api/prescription/detail` ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)).

## Technical detail

Sequelize's `create` and `update` accept a plain object and apply every property matching a model attribute. Without an explicit `fields` option or a validated allow-list, the attack surface of the endpoint is the **entire model schema**, not the subset the UI sends.

For `LabOrder`, that includes commercially significant columns — `isPaid`, `paymentStatus`, `orderStatus`, `totalPrice` — and the ownership column `patientId`.

For `PatientDetail`, it includes the full clinical record: notes, medications, allergies, health problems.

The `where: { patientId: data.patientId }` construction is the aggravating factor. Ordinarily mass assignment lets an attacker set unintended fields **on their own** object; here the same untrusted object also chooses **whose** object is modified. This is simultaneously the IDOR of [SEC-011](SEC-011-bola-idor-across-endpoints.md), and the two must be fixed together — allow-listing the fields without fixing the target selection still permits cross-patient writes.

A denylist approach (`delete data.isPaid`) is not an acceptable fix: it fails open for every column added later. Only a positive allow-list is safe.

## Exploit scenario

**Free lab tests**

1. Attacker authenticates as a patient and observes the legitimate order request in their browser.
2. They replay it with additional fields:
   ```json
   {
     "patientId": 4821, "orderDetails": [...],
     "totalPrice": 0, "isPaid": true, "paymentStatus": "paid", "orderStatus": "confirmed"
   }
   ```
3. `LabOrder.create(orderData)` writes all of them. The order is created as paid, for zero, without any payment gateway interaction.

**Cross-patient clinical record overwrite**

4. Attacker calls `POST /api/patient/update-notes`:
   ```json
   { "patientId": 1, "notes": "No known allergies.", "medications": "" }
   ```
5. `PatientDetail.update(data, { where: { patientId: 1 } })` overwrites patient 1's record. The attacker's own id is never consulted.
6. Erasing a recorded allergy in a system used for clinical decisions is a direct patient-safety risk.

**Order reassignment**

7. Setting `patientId` to another user's id on order creation books tests against that patient's record and their billing.

## Impact

- **Integrity:** arbitrary modification of clinical records belonging to other patients; falsification of payment and order state.
- **Confidentiality:** creating an order against another patient's id can surface that patient's data in subsequent responses.
- **Financial:** lab orders marked paid without payment; totals set to zero.
- **Patient safety:** silent modification of allergy, medication and notes fields.
- **Regulatory:** HIPAA §164.312(c)(1) requires protection against improper alteration of ePHI.

## Remediation

**Step 1 — fix the broken imports first.** These are one-line changes that immediately restore intended protection:

```diff
--- a/routes/labTestRoutes.js
-const { labOrderValidation } = require('../validation/labOrderValidation');
+const { createLabOrderSchema } = require('../validation/labOrderValidation');
@@
-router.post('/order', jwtAuth, LabTestController.createLabOrder);
+router.post('/order', jwtAuth, validateSchema(createLabOrderSchema), LabTestController.createLabOrder);
```

**Step 2 — make `validateSchema` strip unknown keys.** A schema that only *rejects* is fragile; one that also strips gives defence in depth:

```js
// middleware/validateSchema.js
const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,     // unknown keys removed, never reach the model
    convert: true,
});
if (error) return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.validationError,
                                         error.details.map(d => d.message));
req.body = value;           // the handler sees only validated, allow-listed fields
next();
```

Also add the missing `schema.validate` guard so a bad import fails loudly at boot rather than at request time — see [SEC-027](SEC-027-broken-and-missing-validation.md).

**Step 3 — allow-list at the service layer too.** Validation can be bypassed by a new route that forgets it; the service is the last line:

```js
// services/labTestService.js
const LAB_ORDER_CLIENT_FIELDS = ['labId', 'branchId', 'appointmentDate', 'appointmentSlot', 'addressId'];

static async createLabOrder(data, actor) {
    const { orderDetails } = data;
    const orderData = pick(data, LAB_ORDER_CLIENT_FIELDS);      // positive allow-list

    // Server-controlled fields — never taken from the client.
    orderData.patientId     = actor.id;
    orderData.totalPrice    = await computeTotal(orderDetails);
    orderData.isPaid        = false;
    orderData.paymentStatus = 'pending';
    orderData.orderStatus   = 'created';

    const labOrder = await LabOrder.create(orderData, {
        fields: [...LAB_ORDER_CLIENT_FIELDS, 'patientId', 'totalPrice', 'isPaid', 'paymentStatus', 'orderStatus'],
        transaction,
    });
    ...
}
```

Sequelize's `fields` option is a hard stop: attributes outside the list are ignored even if present on the object.

**Step 4 — fix the target selection.**

```js
// services/patientService.js
const PATIENT_DETAIL_CLIENT_FIELDS = ['height', 'weight', 'bloodGroup', 'address1', 'city', 'state', 'zip_code'];

static async updateProfile(patientId, data) {
    const values = pick(data, PATIENT_DETAIL_CLIENT_FIELDS);
    return PatientDetail.update(values, {
        where: { patientId },                        // from req.user.id, NOT from data
        fields: PATIENT_DETAIL_CLIENT_FIELDS,
    });
}
```

Controller: `await PatientService.updateProfile(req.user.id, req.body);` — clinical fields such as notes, medications and allergies must be writable only through clinician-role endpoints with their own narrower allow-list.

**Step 5 — payment state must come from the gateway.** `isPaid` and `paymentStatus` should only ever be set by a verified Razorpay webhook with signature validation, never by a client request on any endpoint.

## Verification

1. **Extra-field test:** submit a lab order with `isPaid: true, totalPrice: 0`. The persisted row must show `isPaid = false` and a server-computed total.
2. **Cross-patient test:** submit `update-notes` with another patient's `patientId`. Must return 403 and leave the target row unchanged.
3. **Strip test:** submit an unknown field and confirm it appears nowhere in the stored row and produces a 400 or is silently stripped, per the configured behaviour.
4. **Import test:** `node -e "console.log(require('./validation/labOrderValidation'))"` shows the exported schema, and the route imports that exact name.
5. **Boot test:** deliberately break a schema import and confirm the application refuses to start.
6. **Static check:** `grep -rnE "\.(create|update)\(\s*(req\.body|data)\s*[,)]" services/ controllers/` returns no results.

## References

- OWASP — [Mass Assignment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)
- OWASP API Security Top 10 2023 — API3:2023 Broken Object Property Level Authorization
- Sequelize — [`fields` option on create/update](https://sequelize.org/docs/v6/core-concepts/model-instances/)
- CWE-915 — [Improperly Controlled Modification of Dynamically-Determined Object Attributes](https://cwe.mitre.org/data/definitions/915.html)
