# SEC-027 — Input validation absent, or silently broken by bad imports

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 6.5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:L`) |
| OWASP Top 10 2021 | A04:2021 – Insecure Design; A03:2021 – Injection |
| OWASP ASVS 4.0.3 | V5.1.1 – Input validated against a positive allow-list; V5.1.3 – All input validated; V5.1.4 – Structured data strongly typed |
| CWE | CWE-20 – Improper Input Validation; CWE-1188 – Insecure Default Initialization |
| Status | Open |
| Affected component | `routes/patientAssessmentRoutes.js`, `routes/labTestRoutes.js`, `routes/patientProfileRoutes.js`, `middleware/validateSchema.js`, `validation/` |

## Summary

Validation in this codebase fails in three distinct ways, and the middle one is the most insidious.

1. **Absent** — several sensitive routes apply no schema at all, including the bulk assessment endpoints that feed the SQL injection in [SEC-006](SEC-006-sql-injection.md).
2. **Silently broken** — `validation/patientAssessmentValidator.js` and `validation/labOrderValidation.js` are imported under the wrong export name, so the imported value is `undefined`. `middleware/validateSchema.js` calls `schema.validate(...)` on it with no guard, producing a `TypeError` on every request to those routes.
3. **Disabled** — `profileSchema` is imported but commented out in `routes/patientProfileRoutes.js`.

Case 2 is worse than case 1. A missing schema is visible in review; a broken import looks correct at the call site and fails only at runtime. The validation that would have prevented the mass assignment in [SEC-013](SEC-013-mass-assignment.md) was written, committed, and then disconnected by a naming mismatch that nothing detects.

## Affected code

### Broken import — assessment

`routes/patientAssessmentRoutes.js:5,10`:

```js
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');   // module object
...
router.post('/', validateDataEncryption(), jwtAuth, validateSchema(patientAssessmentSchema), PatientAssessmentController.create);
```

The module exports `{ patientAssessmentSchema }`, so the variable holds the module *object*, not the schema. `middleware/validateSchema.js:4` then calls `schema.validate(req.body)` on an object that has no `validate` method.

### Broken import — lab orders

`routes/labTestRoutes.js:7`:

```js
const { labOrderValidation } = require('../validation/labOrderValidation');   // → undefined
```

The module exports `{ createLabOrderSchema }`. The destructured name does not exist, so `labOrderValidation` is `undefined` — and it is never referenced anywhere in the file. `routes/labTestRoutes.js:23` therefore mounts `POST /order` with **no validation at all**, which is the mass assignment in [SEC-013](SEC-013-mass-assignment.md).

### Disabled

`routes/patientProfileRoutes.js:4-5,13,15` — the schema import is commented out and the routes carry no `validateSchema`. These are the profile and notes update endpoints that write to `PatientDetail` using a body-supplied `patientId`.

### Absent

- `routes/assessmentRoutes.js:16` — `POST /createBulk`, no schema. Feeds `patientAssessmentService.js:186-201` ([SEC-006](SEC-006-sql-injection.md)).
- `routes/patientAssessmentRoutes.js:11` — `POST /bulk`, no schema. Same sink.
- `routes/prescriptionRoutes.js:7` — no schema and no authentication ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)); feeds the Puppeteer injection in [SEC-015](SEC-015-html-injection-puppeteer-pdf.md).
- `routes/chatRoutes.js:6-13` — no schema on any of the eight endpoints.

### The middleware has no guard

`middleware/validateSchema.js` calls `schema.validate(...)` directly. There is no check that `schema` is a Joi object, so a bad import fails at request time rather than at boot.

## Technical detail

**Why the broken imports are not caught.** JavaScript destructuring of a missing property yields `undefined` rather than throwing. Passing `undefined` to `validateSchema` succeeds — it merely returns a closure. The failure surfaces only when a request arrives, at which point it becomes a 500 routed into the error handling described in [SEC-025](SEC-025-verbose-error-disclosure.md) and [SEC-026](SEC-026-broken-error-handler.md). With no tests covering these routes, the defect is invisible.

For `labTestRoutes.js` the outcome is worse still: because the unused variable was never wired into a `validateSchema` call, there is no runtime error at all. The route simply has no validation, quietly, and looks like it might.

**Validation is defence in depth, not the primary control.** It does not replace parameterised queries ([SEC-006](SEC-006-sql-injection.md)), output encoding ([SEC-015](SEC-015-html-injection-puppeteer-pdf.md)) or field allow-listing ([SEC-013](SEC-013-mass-assignment.md)). But it is the layer that constrains input shape before it reaches those sinks, and its absence widened every one of them.

**Ordering.** Several routers place `validateDataEncryption()` and `validateSchema()` *before* the authentication middleware — for example `routes/hrRoutes.js:11` and `routes/forgotPasswordRoutes.js:14`. Decryption and validation therefore run on unauthenticated input. That increases pre-auth attack surface ([SEC-029](SEC-029-decryption-middleware-defects.md)) and should be reordered so authentication runs first.

## Exploit scenario

**Via missing validation**

1. Attacker posts to `POST /api/assessments/createBulk` with `assessmentOptionId` set to a SQL fragment rather than a number.
2. No schema rejects it. `patientAssessmentService.js:186-201` joins the values into an `IN (...)` clause and executes them ([SEC-006](SEC-006-sql-injection.md)).

**Via broken import**

3. Attacker posts a lab order with `isPaid: true` and `totalPrice: 0`. The schema that would have stripped them is `undefined` and unused, so the fields reach `LabOrder.create` ([SEC-013](SEC-013-mass-assignment.md)).

**Via runtime failure**

4. Any legitimate request to `POST /api/patient_assessments/` triggers `TypeError: schema.validate is not a function` — a 500 on a core endpoint, and a cheap unauthenticated way to generate error-log volume.

## Impact

- **Integrity:** unvalidated input reaches SQL, HTML templates and model writes.
- **Availability:** guaranteed 500 on affected endpoints.
- **Assurance:** a reviewer reading the routers would conclude validation is in place. The gap between apparent and actual coverage is the real risk here.

## Remediation

**Step 1 — fix the imports (minutes).**

```diff
--- a/routes/patientAssessmentRoutes.js
-const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
+const { patientAssessmentSchema } = require('../validation/patientAssessmentValidator');

--- a/routes/labTestRoutes.js
-const { labOrderValidation } = require('../validation/labOrderValidation');
+const { createLabOrderSchema } = require('../validation/labOrderValidation');
@@
-router.post('/order', jwtAuth, LabTestController.createLabOrder);
+router.post('/order', jwtAuth, validateSchema(createLabOrderSchema), LabTestController.createLabOrder);
```

**Step 2 — make `validateSchema` fail at boot, not at request time.** This is the change that prevents recurrence:

```js
// middleware/validateSchema.js
const Joi = require('joi');

module.exports = function validateSchema(schema) {
    // Fail fast at module load — a bad import crashes startup, not a user request.
    if (!Joi.isSchema(schema)) {
        throw new Error('validateSchema() requires a Joi schema; received ' + typeof schema);
    }
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,       // also closes SEC-013
            convert: true,
        });
        if (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.validationError,
                                          error.details.map(d => d.message));
        }
        req.body = value;             // handlers see only validated, allow-listed data
        next();
    };
};
```

Because `validateSchema(...)` is called at module load when routers are required, a bad import now prevents the application from starting.

**Step 3 — add the missing schemas.** Example for the bulk assessment route, which is the SQL injection feed:

```js
// validation/patientAssessmentValidator.js
const bulkAssessmentSchema = Joi.object({
    assessmentId: Joi.number().integer().positive().required(),
    assessmentData: Joi.array().min(1).max(200).items(
        Joi.object({
            assessmentQuestionId: Joi.number().integer().positive().required(),
            assessmentOptionId:   Joi.number().integer().positive().required(),   // integers only
            answerText:           Joi.string().max(2000).allow('', null),
        })
    ).required(),
}).required();
```

Prioritise, in order: the bulk assessment routes, `POST /prescription/detail`, the chat routes, and the profile update routes.

**Step 4 — reorder middleware** so authentication precedes decryption and validation:

```js
router.post('/preemployee', requireAuth(ROLES.HR), validateDataEncryption(), validateSchema(preEmpAddSchema), HrController.add);
```

**Step 5 — validate params and query too,** not only the body. `validateSchema` currently reads `req.body` only, while several injection sinks take input from `req.query` and `req.params`.

**Step 6 — add a route-coverage test** that enumerates mounted routes and fails if any non-GET route lacks a `validateSchema` layer. Pair it with the auth-coverage test from [SEC-008](SEC-008-unauthenticated-sensitive-routes.md).

## Verification

1. **Boot test:** deliberately break a schema import; the application must refuse to start with a clear message.
2. **Assessment route:** `POST /api/patient_assessments/` with a valid body must return 200, not a 500 `TypeError`.
3. **Type test:** submit `assessmentOptionId: "1 OR 1=1"` to the bulk route — must return 400.
4. **Strip test:** submit an unknown field and confirm it does not appear in the persisted row.
5. **Coverage test:** the route-coverage test passes, and fails when a new unvalidated route is added.
6. **Static check:** `grep -rn "require('../validation/" routes/` — every imported name exists in the corresponding module's exports.

## References

- OWASP — [Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V5.1 Input Validation Requirements
- [Joi documentation](https://joi.dev/api/)
- CWE-20 — [Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)
