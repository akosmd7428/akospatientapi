const { sequelizeDB1 } = require('../config/sequelize');
const { randomDigits } = require('../helpers/secureRandom'); // SEC-018
const { QueryTypes, Op } = require('sequelize');
const crypto = require('crypto');
const WorksmanCompanyList = require('../models/worksmanCompanyList');
const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const LabOrder = require('../models/labOrder');
const LabOrderDetails = require('../models/labOrderDetails');
const Doctor = require('../models/doctorModel');

const DEFAULT_PASSWORD = 'Akosmd@123';
const DEFAULT_LAB_ID = 0;
const DEFAULT_PRICE = 0;

const MIGRATION_COLUMNS = [
    { table: 'worksman_company_list', column: 'createdAt', definition: 'DATETIME NULL' },
    { table: 'worksman_company_list', column: 'updatedAt', definition: 'DATETIME NULL' },
    { table: 'worksman_company_list', column: 'legacy_corporate_id', definition: 'INT NULL' },
    { table: 'worksman_company_list', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'patient', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labOrders', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labOrderDetails', column: 'modeOfTest', definition: 'VARCHAR(255) NULL' },
    { table: 'doctor', column: 'legacy_doctor_id', definition: 'INT NULL' },
    { table: 'doctor', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'speciality', column: 'legacy_speciality_id', definition: 'INT NULL' },
    { table: 'speciality', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'doctor', column: 'fname', definition: 'VARCHAR(255) NULL' },
    { table: 'doctor', column: 'lname', definition: 'VARCHAR(255) NULL' },
    { table: 'doctor', column: 'uuid', definition: 'VARCHAR(255) NULL' },
    { table: 'labPackagesMaster', column: 'package_code', definition: 'VARCHAR(255) NULL' },
    { table: 'labPackagesMaster', column: 'legacy_package_id', definition: 'INT NULL' },
    { table: 'labPackagesMaster', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labPackages', column: 'master_package_id', definition: 'INT NULL' },
    { table: 'labPackages', column: 'labId', definition: 'INT NULL' },
    { table: 'labPackages', column: 'package_code', definition: 'VARCHAR(255) NULL' },
    { table: 'labPackages', column: 'legacy_package_id', definition: 'INT NULL' },
    { table: 'labPackages', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labs', column: 'legacy_lab_id', definition: 'INT NULL' },
    { table: 'labs', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labBranches', column: 'legacy_branch_id', definition: 'INT NULL' },
    { table: 'labBranches', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'labTests', column: 'master_test_id', definition: 'INT NULL' },
    { table: 'labTests', column: 'is_migrated', definition: 'TINYINT(1) NOT NULL DEFAULT 0' }
];

let migrationColumnsEnsured = false;

class MigrationService {
    // SEC-003 / SEC-035: was unsalted MD5 over a shared DEFAULT_PASSWORD, so every
    // migrated account carried the same recoverable hash. Migrated accounts now
    // get an unusable random credential and must activate via password reset.
    static async hashPassword(plain) {
        const { hashPassword } = require('../helpers/passwordHelper');
        return hashPassword(plain || crypto.randomBytes(32).toString('hex'));
    }

    static splitName(fullName = '') {
        const parts = String(fullName).trim().split(/\s+/);
        const first_name = parts.shift() || '';
        const last_name = parts.join(' ');
        return { first_name, last_name };
    }

    static stripTitle(name) {
        return String(name || '')
            .trim()
            .replace(/^(dr|mr|mrs|ms|miss|prof)(\.\s*|\s+)/i, '')
            .trim();
    }

    static buildDoctorUuid(firstName, doctorId) {
        const slug = String(firstName || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'doctor';
        return `${slug}-${doctorId}`;
    }

    static splitDoctorName(payload) {
        const rawFirst = payload && payload.first_name ? String(payload.first_name).trim() : '';
        const rawLast = payload && payload.last_name ? String(payload.last_name).trim() : '';

        const combined = [rawFirst, rawLast].filter(Boolean).join(' ').trim();
        const cleaned = this.stripTitle(combined);

        if (!cleaned) {
            return { fname: '', lname: '' };
        }

        const parts = cleaned.split(/\s+/);
        const fname = parts.shift() || '';
        const lname = parts.join(' ');
        return { fname, lname };
    }

    static toNumberOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
    }

    static mapCaseStatusToOrderStatus(caseStatus) {
        if (!caseStatus) return 'pending';
        const s = String(caseStatus).toLowerCase();
        if (s.includes('complete')) return 'Completed';
        if (s.includes('cancel')) return 'cancelled';
        if (s.includes('confirm')) return 'confirmed';
        if (s.includes('sample')) return 'Sample Sent';
        if (s.includes('await')) return 'Result Awaited';
        if (s.includes('report')) return 'Report Generated';
        return 'pending';
    }

    static mapInvoiceStatusToPaymentStatus(invoiceStatus) {
        if (!invoiceStatus) return 'unpaid';
        const s = String(invoiceStatus).toLowerCase();
        if (s === 'done' || s === 'paid') return 'paid';
        if (s.includes('initiat')) return 'Payment Initiated';
        if (s.includes('fail')) return 'failed';
        return 'unpaid';
    }

    static async ensureMigrationColumns() {
        if (migrationColumnsEnsured) return;
        const dbName = sequelizeDB1.config.database;

        for (const { table, column, definition } of MIGRATION_COLUMNS) {
            const [row] = await sequelizeDB1.query(
                `SELECT COUNT(*) AS colCount
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
                {
                    replacements: { db: dbName, table, column },
                    type: QueryTypes.SELECT
                }
            );

            if (!Number(row && row.colCount)) {
                await sequelizeDB1.query(
                    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
                );
            }
        }

        migrationColumnsEnsured = true;
    }

    static async generateUniqueEmployerId(transaction) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = String(Number(randomDigits(6)));
            const exists = await WorksmanCompanyList.findOne({
                where: { employer_id: candidate },
                transaction
            });
            if (!exists) return candidate;
        }
        throw new Error('Unable to generate a unique 6-digit employer_id');
    }

    static async upsertCorporate(corporate_id, corporate_name, transaction) {
        let company = await WorksmanCompanyList.findOne({
            where: { company_name: corporate_name },
            transaction
        });

        if (!company) {
            const employerId = await this.generateUniqueEmployerId(transaction);
            company = await WorksmanCompanyList.create({
                company_name: corporate_name,
                employer_id: employerId,
                parent_id: '0',
                legacy_corporate_id: this.toNumberOrNull(corporate_id),
                is_migrated: true
            }, { transaction });
        }

        return company;
    }

    static async upsertPatient(employee, companyId, transaction) {
        const { first_name, last_name } = this.splitName(employee.emp_name);
        const email = employee.emp_email
            ? String(employee.emp_email).trim().toLowerCase()
            : `legacy_${employee.id}_${companyId}@migrated.akosmd.local`;

        let patient = await Patient.findOne({ where: { email }, transaction });

        if (patient) {
            return { patient, isNew: false };
        }

        const patientData = {
            uuid: crypto.randomUUID(),
            first_name,
            last_name,
            email,
            password: await this.hashPassword(),
            dateofbirth: employee.emp_dob || null,
            phone: employee.emp_mobile ? String(employee.emp_mobile) : null,
            companyId,
            employer_id: companyId,
            uniquePatientId: employee.emp_ID
                ? String(employee.emp_ID)
                : String(Number(randomDigits(6))),
            isFirstLogin: 0,
            isProfileCompleted: 0,
            is_migrated: true
        };

        patient = await Patient.create(patientData, { transaction });
        return { patient, isNew: true };
    }

    static async upsertConnectedCompanyPatient(patient, companyId, transaction) {
        const existing = await ConnectedCompaniesPatient.findOne({
            where: { patientId: String(patient.id), companyId },
            transaction
        });
        if (existing) return existing;

        return ConnectedCompaniesPatient.create({
            connectionType: '1',
            companyId,
            patientId: String(patient.id),
            uniquePatientId: patient.uniquePatientId || String(patient.id),
            patientEmail: patient.email,
            status: '1',
            isActive: true,
            password: await this.hashPassword()
        }, { transaction });
    }

    static async createBooking(booking, patient, companyId, transaction) {
        const existing = booking.booking_ID
            ? await LabOrder.findOne({
                where: { uniqueBookingId: String(booking.booking_ID) },
                transaction
            })
            : null;
        if (existing) return { labOrder: existing, isNew: false };

        const price = this.toNumberOrNull(booking.package_amount) ?? DEFAULT_PRICE;
        const totalPrice = this.toNumberOrNull(booking.billing_amount) ?? price;

        const orderData = {
            patientId: patient.id,
            bookingDate: booking.emp_date_of_checkup || null,
            bookingTime: booking.emp_time_of_checkup || null,
            bookingAddress: booking.address || null,
            labId: this.toNumberOrNull(booking.diagnostic_id) ?? DEFAULT_LAB_ID,
            labCityName: booking.location_of_test || null,
            price,
            otherCharges: 0,
            discountApplied: 0,
            totalPrice,
            isPaid: this.mapInvoiceStatusToPaymentStatus(booking.invoice_status) === 'paid',
            orderStatus: this.mapCaseStatusToOrderStatus(booking.case_status),
            paymentStatus: this.mapInvoiceStatusToPaymentStatus(booking.invoice_status),
            uniqueBookingId: booking.booking_ID ? String(booking.booking_ID) : null,
            labReportURL: booking.upload_document || null,
            isActive: true,
            isDeleted: false,
            is_migrated: true,
            response: {
                legacy_id: booking.id,
                dc_invoice_no: booking.dc_invoice_no,
                dc_rate: booking.dc_rate,
                invoice_number: booking.invoice_number,
                billing_month: booking.billing_month,
                billing_year: booking.billing_year,
                remarks: booking.remarks,
                pending_test: booking.pending_test,
                type_of_checkup: booking.type_of_checkup,
                soft_copy_report_status: booking.soft_copy_report_status,
                hard_copy_report_status: booking.hard_copy_report_status,
                legacy_corporate_id: booking.corporate_id
            }
        };

        const labOrder = await LabOrder.create(orderData, { transaction });

        if (booking.package_name) {
            await LabOrderDetails.create({
                labOrderId: labOrder.id,
                patientId: patient.id,
                type: 'Package',
                mode: 'Pathology',
                referenceId: 0,
                name: booking.package_name,
                modeOfTest: booking.package_tests || null,
                noOfTest: 1,
                price,
                discount: 0,
                total: totalPrice,
                isActive: true,
                isDeleted: false,
                companyIdPackageTest: companyId,
                patientCompanyId: companyId
            }, { transaction });
        }

        if (booking.created_at || booking.updated_at) {
            await sequelizeDB1.query(
                'UPDATE labOrders SET createdAt = COALESCE(:createdAt, createdAt), updatedAt = COALESCE(:updatedAt, updatedAt) WHERE id = :id',
                {
                    replacements: {
                        createdAt: booking.created_at || null,
                        updatedAt: booking.updated_at || null,
                        id: labOrder.id
                    },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
        }

        return { labOrder, isNew: true };
    }

    static async migrateCorporatePayload(payload) {
        const { corporate_id, corporate_name, employees = [] } = payload || {};

        if (!corporate_name) {
            throw new Error('corporate_name is required');
        }

        await this.ensureMigrationColumns();

        const transaction = await sequelizeDB1.transaction();
        const summary = {
            corporate: null,
            employees_processed: 0,
            employees_created: 0,
            employees_existing: 0,
            bookings_created: 0,
            bookings_existing: 0,
            details: []
        };

        try {
            const company = await this.upsertCorporate(corporate_id, corporate_name, transaction);
            summary.corporate = {
                id: company.id,
                company_name: company.company_name,
                employer_id: company.employer_id,
                legacy_corporate_id: company.legacy_corporate_id ?? this.toNumberOrNull(corporate_id),
                is_migrated: company.is_migrated
            };

            for (const employee of employees) {
                summary.employees_processed += 1;

                const { patient, isNew } = await this.upsertPatient(employee, company.id, transaction);
                if (isNew) summary.employees_created += 1;
                else summary.employees_existing += 1;

                await this.upsertConnectedCompanyPatient(patient, company.id, transaction);

                const bookingResults = [];
                for (const booking of employee.bookings || []) {
                    const { labOrder, isNew: isNewBooking } = await this.createBooking(
                        booking, patient, company.id, transaction
                    );
                    if (isNewBooking) summary.bookings_created += 1;
                    else summary.bookings_existing += 1;

                    bookingResults.push({
                        legacy_booking_id: booking.id,
                        legacy_booking_ref: booking.booking_ID,
                        labOrderId: labOrder.id,
                        created: isNewBooking
                    });
                }

                summary.details.push({
                    legacy_employee_id: employee.id,
                    patientId: patient.id,
                    email: patient.email,
                    created: isNew,
                    bookings: bookingResults
                });
            }

            await transaction.commit();
            return summary;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    static async upsertSpeciality(specialityPayload, transaction) {
        const speciality_name = specialityPayload
            ? (specialityPayload.specialty_name
                || specialityPayload.speciality_name
                || null)
            : null;
        const legacy_speciality_id = specialityPayload && this.toNumberOrNull(specialityPayload.id);
        if (!speciality_name) {
            throw new Error('specialty_name is required to migrate doctor');
        }

        const [existing] = await sequelizeDB1.query(
            'SELECT id, speciality_name FROM speciality WHERE speciality_name = :name LIMIT 1',
            { replacements: { name: speciality_name }, type: QueryTypes.SELECT, transaction }
        );

        if (existing) {
            return { id: existing.id, speciality_name: existing.speciality_name, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO speciality (speciality_name, is_active, legacy_speciality_id, is_migrated)
             VALUES (:name, 1, :legacyId, 1)`,
            {
                replacements: { name: speciality_name, legacyId: legacy_speciality_id },
                type: QueryTypes.INSERT,
                transaction
            }
        );

        return { id: insertId, speciality_name, isNew: true };
    }

    static async findExistingDoctor(payload, transaction) {
        const legacyId = this.toNumberOrNull(payload.id);
        const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
        const phoneNo = payload.mobile_number ? String(payload.mobile_number).trim() : null;

        const orClauses = [];
        if (legacyId !== null) orClauses.push({ legacy_doctor_id: legacyId });
        if (email) orClauses.push({ email });
        if (phoneNo) orClauses.push({ phoneNo });

        if (!orClauses.length) return null;

        return Doctor.findOne({
            where: { [Op.or]: orClauses },
            transaction
        });
    }

    static async upsertDoctor(payload, specialityRecord, transaction) {
        const { fname, lname } = this.splitDoctorName(payload);
        const fullName = [payload.first_name, payload.last_name]
            .filter(Boolean)
            .map(p => String(p).trim())
            .join(' ')
            .trim() || `Doctor ${payload.id}`;
        const email = payload.email
            ? String(payload.email).trim().toLowerCase()
            : `legacy_doctor_${payload.id}@migrated.akosmd.local`;
        const phoneNo = payload.mobile_number ? String(payload.mobile_number) : '0';
        const profilePic = payload.image || null;
        const legacyId = this.toNumberOrNull(payload.id);

        const existing = await this.findExistingDoctor(payload, transaction);

        if (existing) {
            const uuid = this.buildDoctorUuid(fname, existing.id);
            await existing.update({
                name: fullName,
                email,
                phoneNo,
                speciality: specialityRecord.speciality_name,
                profilePic
            }, { transaction });

            await sequelizeDB1.query(
                `UPDATE doctor
                 SET legacy_doctor_id = :legacyId,
                     is_migrated = 1,
                     fname = :fname,
                     lname = :lname,
                     uuid = :uuid
                 WHERE id = :id`,
                {
                    replacements: {
                        legacyId,
                        fname: fname || null,
                        lname: lname || null,
                        uuid,
                        id: existing.id
                    },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );

            return { doctor: existing, isNew: false, fname, lname, uuid };
        }

        const doctor = await Doctor.create({
            name: fullName,
            email,
            phoneNo,
            experience: 0,
            speciality: specialityRecord.speciality_name,
            star_rating: 0,
            profilePic
        }, { transaction });

        const uuid = this.buildDoctorUuid(fname, doctor.id);

        await sequelizeDB1.query(
            `UPDATE doctor
             SET legacy_doctor_id = :legacyId,
                 is_migrated = 1,
                 fname = :fname,
                 lname = :lname,
                 uuid = :uuid
             WHERE id = :id`,
            {
                replacements: {
                    legacyId,
                    fname: fname || null,
                    lname: lname || null,
                    uuid,
                    id: doctor.id
                },
                type: QueryTypes.UPDATE,
                transaction
            }
        );

        return { doctor, isNew: true, fname, lname, uuid };
    }

    static async upsertDoctorSpeciality(doctorId, specialityId, transaction) {
        const [existing] = await sequelizeDB1.query(
            'SELECT id FROM doctor_speciality WHERE doctor_id = :doctorId AND speciality_id = :specialityId LIMIT 1',
            {
                replacements: { doctorId, specialityId },
                type: QueryTypes.SELECT,
                transaction
            }
        );
        if (existing) return { id: existing.id, isNew: false };

        const [insertId] = await sequelizeDB1.query(
            'INSERT INTO doctor_speciality (doctor_id, speciality_id) VALUES (:doctorId, :specialityId)',
            {
                replacements: { doctorId, specialityId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true };
    }

    static async upsertDoctorEmployer(doctorId, employerId, transaction) {
        const [existing] = await sequelizeDB1.query(
            'SELECT id FROM doctor_employer WHERE doctor_id = :doctorId AND employer_id = :employerId LIMIT 1',
            {
                replacements: { doctorId, employerId },
                type: QueryTypes.SELECT,
                transaction
            }
        );
        if (existing) return { id: existing.id, isNew: false };

        const [insertId] = await sequelizeDB1.query(
            'INSERT INTO doctor_employer (doctor_id, employer_id) VALUES (:doctorId, :employerId)',
            {
                replacements: { doctorId, employerId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true };
    }

    static async findCompanyByLegacyCorporateId(legacyCorporateId, transaction) {
        const id = this.toNumberOrNull(legacyCorporateId);
        if (id === null) return null;
        return WorksmanCompanyList.findOne({
            where: { legacy_corporate_id: id },
            transaction
        });
    }

    static async resolveCorporate(legacyCorporateId, corporateName, transaction) {
        const legacyId = this.toNumberOrNull(legacyCorporateId);

        if (legacyId !== null) {
            const byLegacy = await this.findCompanyByLegacyCorporateId(legacyId, transaction);
            if (byLegacy) return { company: byLegacy, isNew: false };
        }

        if (corporateName) {
            const byName = await WorksmanCompanyList.findOne({
                where: { company_name: corporateName },
                transaction
            });
            if (byName) {
                if (legacyId !== null && byName.legacy_corporate_id == null) {
                    await byName.update({ legacy_corporate_id: legacyId }, { transaction });
                }
                return { company: byName, isNew: false };
            }
        }

        if (!corporateName) return { company: null, isNew: false };

        const company = await this.upsertCorporate(legacyId, corporateName, transaction);
        return { company, isNew: true };
    }

    static async migrateDoctor(doctorPayload, transaction) {
        const specialityRecord = await this.upsertSpeciality(
            doctorPayload.specialty || {
                specialty_name: doctorPayload.specialty_name,
                id: null
            },
            transaction
        );

        const { doctor, isNew } = await this.upsertDoctor(doctorPayload, specialityRecord, transaction);
        const { fname, lname } = this.splitDoctorName(doctorPayload);
        const uuid = this.buildDoctorUuid(fname, doctor.id);

        const docSpecLink = await this.upsertDoctorSpeciality(doctor.id, specialityRecord.id, transaction);

        const corporateInputs = [];
        if (Array.isArray(doctorPayload.corporates)) {
            for (const c of doctorPayload.corporates) {
                if (!c) continue;
                corporateInputs.push({
                    legacy_corporate_id: c.corporate_id,
                    corporate_name: c.corporate_name
                });
            }
        }
        if (doctorPayload.corporate_id !== null && doctorPayload.corporate_id !== undefined) {
            corporateInputs.push({
                legacy_corporate_id: doctorPayload.corporate_id,
                corporate_name: doctorPayload.corporate_name || null
            });
        }

        const corporateResults = [];
        for (const input of corporateInputs) {
            const { company, isNew: isNewCompany } = await this.resolveCorporate(
                input.legacy_corporate_id,
                input.corporate_name,
                transaction
            );
            if (!company) {
                corporateResults.push({
                    legacy_corporate_id: this.toNumberOrNull(input.legacy_corporate_id),
                    corporate_name: input.corporate_name,
                    matched: false,
                    company_created: false,
                    doctor_employer_link_created: false
                });
                continue;
            }

            const link = await this.upsertDoctorEmployer(doctor.id, company.id, transaction);
            corporateResults.push({
                legacy_corporate_id: company.legacy_corporate_id ?? this.toNumberOrNull(input.legacy_corporate_id),
                company_id: company.id,
                company_name: company.company_name,
                employer_id: company.employer_id,
                matched: true,
                company_created: isNewCompany,
                doctor_employer_link_created: link.isNew
            });
        }

        return {
            legacy_doctor_id: this.toNumberOrNull(doctorPayload.id),
            doctor_id: doctor.id,
            email: doctor.email,
            uuid,
            fname: fname || null,
            lname: lname || null,
            doctor_created: isNew,
            speciality: {
                id: specialityRecord.id,
                speciality_name: specialityRecord.speciality_name,
                created: specialityRecord.isNew
            },
            doctor_speciality_link_created: docSpecLink.isNew,
            corporates: corporateResults
        };
    }

    static async migrateDoctorPayload(payload) {
        let doctors;
        if (Array.isArray(payload)) {
            doctors = payload;
        } else if (payload && Array.isArray(payload.data)) {
            doctors = payload.data;
        } else if (payload && Array.isArray(payload.doctors)) {
            doctors = payload.doctors;
        } else {
            doctors = [payload];
        }

        const filtered = doctors.filter(d => d && typeof d === 'object');
        if (!filtered.length) {
            throw new Error('No doctor payload provided');
        }

        await this.ensureMigrationColumns();

        const summary = {
            doctors_processed: 0,
            doctors_created: 0,
            doctors_existing: 0,
            doctors_failed: 0,
            specialities_created: 0,
            corporates_created: 0,
            doctor_employer_links_created: 0,
            details: [],
            failures: []
        };

        for (const doctorPayload of filtered) {
            const transaction = await sequelizeDB1.transaction();
            try {
                const detail = await this.migrateDoctor(doctorPayload, transaction);
                await transaction.commit();

                summary.doctors_processed += 1;
                if (detail.doctor_created) summary.doctors_created += 1;
                else summary.doctors_existing += 1;
                if (detail.speciality.created) summary.specialities_created += 1;
                for (const c of detail.corporates) {
                    if (c.company_created) summary.corporates_created += 1;
                    if (c.doctor_employer_link_created) summary.doctor_employer_links_created += 1;
                }
                summary.details.push(detail);
            } catch (error) {
                await transaction.rollback();
                summary.doctors_failed += 1;
                summary.failures.push({
                    legacy_doctor_id: this.toNumberOrNull(doctorPayload.id),
                    email: doctorPayload.email || null,
                    error: error.message
                });
            }
        }

        return summary;
    }

    static countTestsInPackage(packageTests) {
        if (!packageTests) return 0;
        return String(packageTests)
            .split(/\r?\n/)
            .map(t => t.trim())
            .filter(Boolean)
            .length;
    }

    static async upsertMasterPackage(payload, transaction) {
        const packageName = payload.package_name ? String(payload.package_name).trim() : null;
        if (!packageName) {
            throw new Error('package_name is required');
        }

        const legacyId = this.toNumberOrNull(payload.id);
        const packageCode = payload.package_code ? String(payload.package_code).trim() : null;
        const noOfTest = this.countTestsInPackage(payload.package_tests);
        const notes = payload.package_tests || null;

        const orClauses = [];
        const orReps = {};
        if (legacyId !== null) {
            orClauses.push('legacy_package_id = :legacyId');
            orReps.legacyId = legacyId;
        }
        if (packageCode) {
            orClauses.push('package_code = :packageCode');
            orReps.packageCode = packageCode;
        }
        if (packageName) {
            orClauses.push('packageName = :packageName');
            orReps.packageName = packageName;
        }

        let existing = null;
        if (orClauses.length) {
            const [row] = await sequelizeDB1.query(
                `SELECT id FROM labPackagesMaster WHERE ${orClauses.join(' OR ')} LIMIT 1`,
                { replacements: orReps, type: QueryTypes.SELECT, transaction }
            );
            existing = row || null;
        }

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE labPackagesMaster
                 SET packageName = :name,
                     package_code = :code,
                     notes = :notes,
                     noOfTest = :noOfTest,
                     legacy_package_id = :legacyId,
                     is_migrated = 1,
                     isActive = 1,
                     updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: {
                        name: packageName,
                        code: packageCode,
                        notes,
                        noOfTest,
                        legacyId,
                        id: existing.id
                    },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO labPackagesMaster
                (packageName, package_code, notes, noOfTest, legacy_package_id, is_migrated, isActive, createdAt, updatedAt)
             VALUES (:name, :code, :notes, :noOfTest, :legacyId, 1, 1, NOW(), NOW())`,
            {
                replacements: {
                    name: packageName,
                    code: packageCode,
                    notes,
                    noOfTest,
                    legacyId
                },
                type: QueryTypes.INSERT,
                transaction
            }
        );

        return { id: insertId, isNew: true };
    }

    static async upsertLabPackage(masterId, payload, transaction) {
        const labId = this.toNumberOrNull(payload.diagnostic_id);
        const price = this.toNumberOrNull(payload.package_amount) ?? 0;
        const packageName = payload.package_name ? String(payload.package_name).trim() : null;
        const packageCode = payload.package_code ? String(payload.package_code).trim() : null;
        const noOfTest = this.countTestsInPackage(payload.package_tests);
        const notes = payload.package_tests || null;
        const legacyId = this.toNumberOrNull(payload.id);

        const [existing] = await sequelizeDB1.query(
            `SELECT id FROM labPackages
             WHERE master_package_id = :masterId
               AND ((labId IS NULL AND :labId IS NULL) OR labId = :labId)
             LIMIT 1`,
            {
                replacements: { masterId, labId },
                type: QueryTypes.SELECT,
                transaction
            }
        );

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE labPackages
                 SET price = :price,
                     packageName = :name,
                     package_code = :code,
                     noOfTest = :noOfTest,
                     notes = :notes,
                     legacy_package_id = :legacyId,
                     is_migrated = 1,
                     isActive = 1,
                     updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: {
                        price,
                        name: packageName,
                        code: packageCode,
                        noOfTest,
                        notes,
                        legacyId,
                        id: existing.id
                    },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO labPackages
                (master_package_id, labId, packageName, package_code, price, mode,
                 noOfTest, notes, legacy_package_id, is_migrated, isActive, createdAt, updatedAt)
             VALUES (:masterId, :labId, :name, :code, :price, 'Pathology',
                     :noOfTest, :notes, :legacyId, 1, 1, NOW(), NOW())`,
            {
                replacements: {
                    masterId,
                    labId,
                    name: packageName,
                    code: packageCode,
                    price,
                    noOfTest,
                    notes,
                    legacyId
                },
                type: QueryTypes.INSERT,
                transaction
            }
        );

        return { id: insertId, isNew: true };
    }

    static async upsertCompanyPackageLink(companyId, labPackageId, transaction) {
        const [existing] = await sequelizeDB1.query(
            `SELECT id FROM connectedCompaniesLabPackages
             WHERE companyId = :companyId AND labPackageId = :labPackageId AND type = 'Package'
             LIMIT 1`,
            {
                replacements: { companyId, labPackageId },
                type: QueryTypes.SELECT,
                transaction
            }
        );

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE connectedCompaniesLabPackages
                 SET isActive = 1, updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: { id: existing.id },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO connectedCompaniesLabPackages
                (companyId, categoryId, labPackageId, type, mode, isActive, createdAt, updatedAt)
             VALUES (:companyId, 0, :labPackageId, 'Package', 'Pathology', 1, NOW(), NOW())`,
            {
                replacements: { companyId, labPackageId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true };
    }

    static async migratePackage(packagePayload, transaction) {
        const { id: masterId, isNew: masterIsNew } = await this.upsertMasterPackage(packagePayload, transaction);
        const { id: labPackageId, isNew: labPackageIsNew } = await this.upsertLabPackage(masterId, packagePayload, transaction);

        const labId = this.toNumberOrNull(packagePayload.diagnostic_id);

        const corporateResults = [];
        const corporates = Array.isArray(packagePayload.corporates) ? packagePayload.corporates : [];

        for (const c of corporates) {
            if (!c) continue;
            const { company, isNew: isNewCompany } = await this.resolveCorporate(
                c.corporate_id,
                c.corporate_name,
                transaction
            );

            if (!company) {
                corporateResults.push({
                    legacy_corporate_id: this.toNumberOrNull(c.corporate_id),
                    corporate_name: c.corporate_name,
                    matched: false,
                    company_created: false,
                    company_package_link_created: false
                });
                continue;
            }

            const { isNew: isNewCompanyLink } = await this.upsertCompanyPackageLink(
                company.id, labPackageId, transaction
            );

            corporateResults.push({
                legacy_corporate_id: company.legacy_corporate_id ?? this.toNumberOrNull(c.corporate_id),
                company_id: company.id,
                company_name: company.company_name,
                employer_id: company.employer_id,
                matched: true,
                company_created: isNewCompany,
                company_package_link_created: isNewCompanyLink
            });
        }

        return {
            legacy_package_id: this.toNumberOrNull(packagePayload.id),
            master_package_id: masterId,
            master_package_created: masterIsNew,
            lab_package_id: labPackageId,
            lab_package_created: labPackageIsNew,
            package_name: packagePayload.package_name || null,
            package_code: packagePayload.package_code || null,
            diagnostic_id: labId,
            corporates: corporateResults
        };
    }

    static async migratePackagesPayload(payload) {
        let packages;
        if (Array.isArray(payload)) {
            packages = payload;
        } else if (payload && Array.isArray(payload.packages)) {
            packages = payload.packages;
        } else if (payload && Array.isArray(payload.data)) {
            packages = payload.data;
        } else {
            packages = [payload];
        }

        const filtered = packages.filter(p => p && typeof p === 'object');
        if (!filtered.length) {
            throw new Error('No package payload provided');
        }

        await this.ensureMigrationColumns();

        const summary = {
            packages_processed: 0,
            master_packages_created: 0,
            master_packages_existing: 0,
            lab_packages_created: 0,
            lab_packages_existing: 0,
            packages_failed: 0,
            corporates_created: 0,
            company_package_links_created: 0,
            details: [],
            failures: []
        };

        for (const pkg of filtered) {
            const transaction = await sequelizeDB1.transaction();
            try {
                const detail = await this.migratePackage(pkg, transaction);
                await transaction.commit();

                summary.packages_processed += 1;
                if (detail.master_package_created) summary.master_packages_created += 1;
                else summary.master_packages_existing += 1;
                if (detail.lab_package_created) summary.lab_packages_created += 1;
                else summary.lab_packages_existing += 1;
                for (const c of detail.corporates) {
                    if (c.company_created) summary.corporates_created += 1;
                    if (c.company_package_link_created) summary.company_package_links_created += 1;
                }
                summary.details.push(detail);
            } catch (error) {
                await transaction.rollback();
                summary.packages_failed += 1;
                summary.failures.push({
                    legacy_package_id: this.toNumberOrNull(pkg.id),
                    package_name: pkg.package_name || null,
                    error: error.message
                });
            }
        }

        return summary;
    }

    static async ensureMasterTestTable() {
        await sequelizeDB1.query(`
            CREATE TABLE IF NOT EXISTS mastertest (
                id INT AUTO_INCREMENT PRIMARY KEY,
                test_name VARCHAR(255) NOT NULL,
                isActive TINYINT(1) NOT NULL DEFAULT 1,
                is_migrated TINYINT(1) NOT NULL DEFAULT 0,
                createdAt DATETIME NULL,
                updatedAt DATETIME NULL,
                INDEX idx_test_name (test_name)
            )
        `);
    }

    static parseTestNames(packageTests) {
        if (!packageTests) return [];
        return String(packageTests)
            .split(/\r?\n/)
            .map(t => t.trim())
            .filter(t => t && t.toLowerCase() !== 'package' && t.toLowerCase() !== 'male' && t.toLowerCase() !== 'female');
    }

    static async upsertLab(payload, transaction) {
        const labName = payload.diagnostic_name ? String(payload.diagnostic_name).trim() : null;
        if (!labName) {
            throw new Error('diagnostic_name is required');
        }
        const legacyId = this.toNumberOrNull(payload.id);

        const orClauses = [];
        const orReps = {};
        if (legacyId !== null) {
            orClauses.push('legacy_lab_id = :legacyId');
            orReps.legacyId = legacyId;
        }
        orClauses.push('labName = :labName');
        orReps.labName = labName;

        const [existing] = await sequelizeDB1.query(
            `SELECT id, labName FROM labs WHERE ${orClauses.join(' OR ')} LIMIT 1`,
            { replacements: orReps, type: QueryTypes.SELECT, transaction }
        );

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE labs SET labName = :labName, isActive = 1,
                                 legacy_lab_id = :legacyId, is_migrated = 1, updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: { labName, legacyId, id: existing.id },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false, labName };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO labs (labName, isActive, legacy_lab_id, is_migrated, createdAt, updatedAt)
             VALUES (:labName, 1, :legacyId, 1, NOW(), NOW())`,
            {
                replacements: { labName, legacyId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true, labName };
    }

    static async upsertLabBranch(labId, addressPayload, transaction) {
        const branchName = addressPayload.title ? String(addressPayload.title).trim() : 'Default';
        const branchAddress = addressPayload.address || null;
        const legacyBranchId = this.toNumberOrNull(addressPayload.id);

        const [existing] = await sequelizeDB1.query(
            `SELECT id FROM labBranches
             WHERE labId = :labId AND
                   (legacy_branch_id = :legacyId OR (legacy_branch_id IS NULL AND branchName = :branchName))
             LIMIT 1`,
            {
                replacements: { labId, legacyId: legacyBranchId, branchName },
                type: QueryTypes.SELECT,
                transaction
            }
        );

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE labBranches
                 SET branchName = :branchName, branchAddress = :branchAddress,
                     legacy_branch_id = :legacyId, is_migrated = 1, isActive = 1, updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: { branchName, branchAddress, legacyId: legacyBranchId, id: existing.id },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO labBranches (labId, branchName, branchAddress, isActive,
                                       legacy_branch_id, is_migrated, createdAt, updatedAt)
             VALUES (:labId, :branchName, :branchAddress, 1, :legacyId, 1, NOW(), NOW())`,
            {
                replacements: { labId, branchName, branchAddress, legacyId: legacyBranchId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true };
    }

    static async upsertMasterTest(testName, transaction) {
        const trimmed = String(testName || '').trim();
        if (!trimmed) return null;

        const [existing] = await sequelizeDB1.query(
            `SELECT id, test_name FROM mastertest WHERE test_name = :name LIMIT 1`,
            { replacements: { name: trimmed }, type: QueryTypes.SELECT, transaction }
        );
        if (existing) return { id: existing.id, test_name: existing.test_name, isNew: false };

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO mastertest (test_name, isActive, is_migrated, createdAt, updatedAt)
             VALUES (:name, 1, 1, NOW(), NOW())`,
            { replacements: { name: trimmed }, type: QueryTypes.INSERT, transaction }
        );
        return { id: insertId, test_name: trimmed, isNew: true };
    }

    static async upsertLabTest(labId, masterTestId, testName, transaction) {
        const trimmed = String(testName || '').trim();
        if (!trimmed) return null;

        const [existing] = await sequelizeDB1.query(
            `SELECT id FROM labTests
             WHERE labId = :labId AND
                   ((master_test_id IS NOT NULL AND master_test_id = :masterTestId)
                    OR (master_test_id IS NULL AND name = :name))
             LIMIT 1`,
            {
                replacements: { labId, masterTestId, name: trimmed },
                type: QueryTypes.SELECT,
                transaction
            }
        );

        if (existing) {
            await sequelizeDB1.query(
                `UPDATE labTests
                 SET name = :name, master_test_id = :masterTestId,
                     is_migrated = 1, isActive = 1, updatedAt = NOW()
                 WHERE id = :id`,
                {
                    replacements: { name: trimmed, masterTestId, id: existing.id },
                    type: QueryTypes.UPDATE,
                    transaction
                }
            );
            return { id: existing.id, isNew: false };
        }

        const [insertId] = await sequelizeDB1.query(
            `INSERT INTO labTests (labId, name, mode, isActive,
                                    master_test_id, is_migrated, price, createdAt, updatedAt)
             VALUES (:labId, :name, 'Pathology', 1, :masterTestId, 1, 0, NOW(), NOW())`,
            {
                replacements: { labId, name: trimmed, masterTestId },
                type: QueryTypes.INSERT,
                transaction
            }
        );
        return { id: insertId, isNew: true };
    }

    static async migrateLab(labPayload, transaction) {
        const { id: labId, isNew, labName } = await this.upsertLab(labPayload, transaction);

        const branchResults = [];
        for (const addr of labPayload.addresses || []) {
            if (!addr) continue;
            const { id: branchId, isNew: branchIsNew } = await this.upsertLabBranch(labId, addr, transaction);
            branchResults.push({
                legacy_branch_id: this.toNumberOrNull(addr.id),
                branch_id: branchId,
                title: addr.title || null,
                created: branchIsNew
            });
        }

        const packageResults = [];
        for (const pkg of labPayload.packages || []) {
            if (!pkg) continue;

            const masterPayload = {
                id: pkg.package_id,
                package_name: pkg.package_name,
                package_code: pkg.package_code,
                package_tests: pkg.package_tests
            };
            const { id: masterId, isNew: masterIsNew } = await this.upsertMasterPackage(masterPayload, transaction);

            const labPkgPayload = {
                id: pkg.package_id,
                package_name: pkg.package_name,
                package_code: pkg.package_code,
                package_amount: pkg.package_amount,
                package_tests: pkg.package_tests,
                diagnostic_id: labId
            };
            const { id: labPackageId, isNew: labPackageIsNew } = await this.upsertLabPackage(masterId, labPkgPayload, transaction);

            const testResults = [];
            for (const testName of this.parseTestNames(pkg.package_tests)) {
                const masterTest = await this.upsertMasterTest(testName, transaction);
                if (!masterTest) continue;
                const labTest = await this.upsertLabTest(labId, masterTest.id, testName, transaction);
                testResults.push({
                    test_name: testName,
                    master_test_id: masterTest.id,
                    master_test_created: masterTest.isNew,
                    lab_test_id: labTest ? labTest.id : null,
                    lab_test_created: labTest ? labTest.isNew : false
                });
            }

            packageResults.push({
                legacy_package_id: this.toNumberOrNull(pkg.package_id),
                master_package_id: masterId,
                master_package_created: masterIsNew,
                lab_package_id: labPackageId,
                lab_package_created: labPackageIsNew,
                package_name: pkg.package_name,
                package_code: pkg.package_code,
                tests: testResults
            });
        }

        return {
            legacy_lab_id: this.toNumberOrNull(labPayload.id),
            lab_id: labId,
            lab_name: labName,
            lab_created: isNew,
            branches: branchResults,
            packages: packageResults
        };
    }

    static async migrateLabsPayload(payload) {
        let labs;
        if (Array.isArray(payload)) {
            labs = payload;
        } else if (payload && Array.isArray(payload.diagnostics)) {
            labs = payload.diagnostics;
        } else if (payload && Array.isArray(payload.data)) {
            labs = payload.data;
        } else if (payload && Array.isArray(payload.labs)) {
            labs = payload.labs;
        } else {
            labs = [payload];
        }

        const filtered = labs.filter(l => l && typeof l === 'object');
        if (!filtered.length) {
            throw new Error('No lab payload provided');
        }

        await this.ensureMigrationColumns();
        await this.ensureMasterTestTable();

        const summary = {
            labs_processed: 0,
            labs_created: 0,
            labs_existing: 0,
            labs_failed: 0,
            branches_created: 0,
            master_packages_created: 0,
            lab_packages_created: 0,
            master_tests_created: 0,
            lab_tests_created: 0,
            details: [],
            failures: []
        };

        for (const labPayload of filtered) {
            const transaction = await sequelizeDB1.transaction();
            try {
                const detail = await this.migrateLab(labPayload, transaction);
                await transaction.commit();

                summary.labs_processed += 1;
                if (detail.lab_created) summary.labs_created += 1;
                else summary.labs_existing += 1;

                for (const b of detail.branches) {
                    if (b.created) summary.branches_created += 1;
                }
                for (const p of detail.packages) {
                    if (p.master_package_created) summary.master_packages_created += 1;
                    if (p.lab_package_created) summary.lab_packages_created += 1;
                    for (const t of p.tests) {
                        if (t.master_test_created) summary.master_tests_created += 1;
                        if (t.lab_test_created) summary.lab_tests_created += 1;
                    }
                }
                summary.details.push(detail);
            } catch (error) {
                await transaction.rollback();
                console.log(
                    `[migrateLab] failed legacy_lab_id=${labPayload.id} name=${labPayload.diagnostic_name}:`,
                    error.message,
                    error.original ? `(sqlMessage: ${error.original.sqlMessage}, sql: ${error.sql})` : ''
                );
                summary.labs_failed += 1;
                summary.failures.push({
                    legacy_lab_id: this.toNumberOrNull(labPayload.id),
                    diagnostic_name: labPayload.diagnostic_name || null,
                    error: error.message,
                    sql_error: error.original ? error.original.sqlMessage : null,
                    sql: error.sql || null
                });
            }
        }

        return summary;
    }
}

module.exports = MigrationService;
