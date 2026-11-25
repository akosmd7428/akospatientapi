-- ABDM Integration Tables
-- Date: 2026-11-23
-- Purpose: Create tables for ABDM M1-M4 integration

-- ABHA account linked to patient
CREATE TABLE IF NOT EXISTS abdm_abha_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    abha_number VARCHAR(20) NOT NULL,
    abha_address VARCHAR(100) NOT NULL,
    link_token VARCHAR(500),
    link_token_expiry DATETIME,
    profile_json JSON,
    status ENUM('active','inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_patient (patient_id),
    UNIQUE KEY uk_abha_number (abha_number),
    INDEX idx_abha_address (abha_address),
    FOREIGN KEY (patient_id) REFERENCES patient(id)
);

-- Care contexts (visits) linked to patient's ABHA
CREATE TABLE IF NOT EXISTS abdm_care_contexts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    abha_account_id INT NOT NULL,
    care_context_reference VARCHAR(100) NOT NULL,
    care_context_display VARCHAR(200) NOT NULL,
    care_context_type ENUM('OPConsultation','Prescription','DiagnosticReport',
                           'DischargeSummary','ImmunizationRecord','HealthDocumentRecord',
                           'WellnessRecord','Invoice') NOT NULL,
    source_type ENUM('appointment','labOrder','prescription') NOT NULL,
    source_id INT NOT NULL,
    linked_at DATETIME,
    link_status ENUM('pending','linked','failed') DEFAULT 'pending',
    link_request_id VARCHAR(100),
    fhir_bundle JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reference (care_context_reference),
    FOREIGN KEY (patient_id) REFERENCES patient(id),
    FOREIGN KEY (abha_account_id) REFERENCES abdm_abha_accounts(id)
);

-- Consent requests (M3 - HIU side)
CREATE TABLE IF NOT EXISTS abdm_consent_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consent_request_id VARCHAR(100),
    patient_id INT NOT NULL,
    requester_id INT NOT NULL,
    purpose_code VARCHAR(50) NOT NULL,
    hi_types JSON NOT NULL,
    date_range_from DATETIME NOT NULL,
    date_range_to DATETIME NOT NULL,
    expiry DATETIME NOT NULL,
    status ENUM('requested','granted','denied','revoked','expired') DEFAULT 'requested',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patient(id)
);

-- Consent artefacts (granted consents)
CREATE TABLE IF NOT EXISTS abdm_consent_artefacts (
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
CREATE TABLE IF NOT EXISTS abdm_gateway_logs (
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
