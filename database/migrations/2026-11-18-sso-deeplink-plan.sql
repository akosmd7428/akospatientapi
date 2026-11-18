-- /api/auth/sso-deeplink now stores the member and the care plan of every link (models/ssoDeeplinkCode.js).
-- Run the part that fits the environment; check first with:
--   SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssoDeeplinkCode';

-- A) the table does not exist yet (it is missing in the local database)
CREATE TABLE IF NOT EXISTS `ssoDeeplinkCode` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `codeHash` VARCHAR(64) NOT NULL,
    `patientId` INT NOT NULL,
    `companyId` INT NOT NULL,
    `redirectPath` VARCHAR(255) NOT NULL,
    `member_id` VARCHAR(50) NULL,
    `plan_code` VARCHAR(20) NULL,
    `care_plan_id` INT NULL,
    `expiresAt` DATETIME NOT NULL,
    `usedAt` DATETIME NULL,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ssoDeeplinkCode_codeHash_unique` (`codeHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B) the table already exists without the new columns
-- ALTER TABLE `ssoDeeplinkCode`
--     ADD COLUMN `member_id` VARCHAR(50) NULL AFTER `redirectPath`,
--     ADD COLUMN `plan_code` VARCHAR(20) NULL AFTER `member_id`,
--     ADD COLUMN `care_plan_id` INT NULL AFTER `plan_code`;

-- Links created before this change have no member/plan stored; /sso-deeplink-verify refuses them,
-- they expire within SSO_DEEPLINK_EXPIRY_SECONDS anyway.
