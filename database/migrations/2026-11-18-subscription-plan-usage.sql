-- Free services under a company care plan (services/subscriptionUsageService.js), only used when the company has
-- worksman_company_list.is_plan_id_verify = 1. One row per free use: lab test booking (labTests), appointment
-- (careAppointment) or talk to doctor call (practitioner). The allowance is subscriptionPlans.planValue uses per
-- patient per period (period_start), subscriptionPlans.avail_value stays the running total over all patients.
-- New table only, nothing existing is changed.

CREATE TABLE IF NOT EXISTS `subscription_plan_usage` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `patient_id` INT NOT NULL,
    `company_id` INT NOT NULL,
    `care_plan_id` INT NOT NULL,             -- careplans.id
    `subscription_plan_id` INT NOT NULL,     -- subscriptionPlans.id (plan + service)
    `plan_key` VARCHAR(50) NOT NULL,         -- labTests | careAppointment | practitioner
    `period_start` DATE NOT NULL,            -- first day of the monthly / quarterly / annual period of the use
    `reference_type` VARCHAR(30) NULL,       -- labOrder | appointment | call
    `reference_id` VARCHAR(64) NULL,         -- labOrders.id | appointments.id | call id
    `created_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `subscription_plan_usage_count` (`subscription_plan_id`, `patient_id`, `period_start`),
    KEY `subscription_plan_usage_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
