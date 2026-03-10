-- ================================================================
-- AI-DRIVEN PRIOR AUTHORIZATION SYSTEM
-- CLINICAL DATABASE SCHEMA (PHI-CONTAINING)
-- PostgreSQL 15+ with TimescaleDB extension
-- ================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_crypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ================================================================
-- CORE ENTITIES
-- ================================================================

-- Prior Authorization Requests (Main Entity)
CREATE TABLE pa_requests (
    pa_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_number VARCHAR(20) UNIQUE NOT NULL, -- Format: PA-YYYY-NNNNNN
    
    -- Patient Information (Encrypted PHI)
    patient_first_name TEXT NOT NULL, -- Encrypted
    patient_last_name TEXT NOT NULL, -- Encrypted
    patient_dob DATE NOT NULL, -- Encrypted
    patient_gender VARCHAR(20),
    patient_address_line1 TEXT, -- Encrypted
    patient_address_line2 TEXT, -- Encrypted
    patient_city VARCHAR(100), -- Encrypted
    patient_state VARCHAR(2),
    patient_zip VARCHAR(10), -- Encrypted
    patient_phone VARCHAR(20), -- Encrypted
    patient_email VARCHAR(255), -- Encrypted
    
    -- Insurance Information
    member_id VARCHAR(50) NOT NULL,
    payer_id UUID NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(50), -- HMO, PPO, EPO, POS
    group_number VARCHAR(50),
    insurance_phone VARCHAR(20),
    
    -- Clinical Information
    primary_diagnosis_code VARCHAR(10) NOT NULL, -- ICD-10
    primary_diagnosis_description TEXT,
    secondary_diagnosis_codes JSONB, -- Array of ICD-10 codes
    procedure_code VARCHAR(10) NOT NULL, -- CPT/HCPCS
    procedure_description TEXT,
    procedure_modifier VARCHAR(10),
    procedure_quantity INTEGER DEFAULT 1,
    place_of_service VARCHAR(2), -- CMS Place of Service codes
    
    -- Medication-specific (if applicable)
    medication_name VARCHAR(255),
    medication_ndc VARCHAR(11), -- National Drug Code
    medication_dosage VARCHAR(100),
    medication_frequency VARCHAR(100),
    medication_duration_days INTEGER,
    medication_quantity INTEGER,
    
    -- Clinical Summary
    clinical_summary TEXT, -- Encrypted clinical notes
    clinical_rationale TEXT,
    relevant_labs JSONB,
    relevant_imaging JSONB,
    treatment_history TEXT,
    
    -- Provider Information
    requesting_provider_npi VARCHAR(10) NOT NULL,
    requesting_provider_name VARCHAR(255) NOT NULL,
    requesting_provider_specialty VARCHAR(100),
    requesting_provider_phone VARCHAR(20),
    requesting_provider_fax VARCHAR(20),
    facility_npi VARCHAR(10),
    facility_name VARCHAR(255),
    facility_tax_id VARCHAR(20),
    
    -- Request Metadata
    request_source VARCHAR(50) NOT NULL, -- PORTAL, FAX, HL7, FHIR, EDI
    request_channel VARCHAR(50), -- WEB, API, INTEGRATION
    urgency_level VARCHAR(20) DEFAULT 'ROUTINE', -- ROUTINE, URGENT, STAT
    requested_service_date DATE,
    length_of_stay INTEGER, -- For inpatient
    
    -- Status & Workflow
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED', 
    -- SUBMITTED, PENDING_INFO, IN_REVIEW, APPROVED, DENIED, APPEALED
    substatus VARCHAR(100),
    decision_type VARCHAR(50), -- AUTO_APPROVED, HUMAN_APPROVED, DENIED
    approval_number VARCHAR(50),
    denial_reason_code VARCHAR(10),
    denial_reason_text TEXT,
    
    -- AI Analysis
    ai_confidence_score DECIMAL(5,2), -- 0.00 to 100.00
    ai_recommendation VARCHAR(20), -- APPROVE, DENY, REVIEW
    ai_rationale TEXT,
    ai_risk_factors JSONB,
    ai_model_version VARCHAR(50),
    
    -- Reviewer Assignment
    assigned_reviewer_id UUID,
    assigned_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_id UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    physician_countersigned_by UUID,
    physician_countersigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Dates & Deadlines
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decision_deadline TIMESTAMP WITH TIME ZONE,
    decided_at TIMESTAMP WITH TIME ZONE,
    notified_at TIMESTAMP WITH TIME ZONE,
    
    -- Turnaround Time Metrics
    intake_to_decision_hours INTEGER,
    submission_to_decision_hours INTEGER,
    
    -- Appeal Information
    appeal_id UUID,
    appealed_at TIMESTAMP WITH TIME ZONE,
    appeal_decision VARCHAR(50), -- UPHELD, OVERTURNED, MODIFIED
    
    -- Document References
    uploaded_documents JSONB, -- Array of document IDs
    generated_letters JSONB, -- Determination letters
    
    -- Integration Data
    external_pa_id VARCHAR(100), -- Payer's PA ID
    payer_response JSONB, -- Raw payer response
    ehr_order_id VARCHAR(100), -- EHR order reference
    
    -- Audit Fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    
    -- Soft Delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    
    CONSTRAINT fk_payer FOREIGN KEY (payer_id) REFERENCES payers(payer_id),
    CONSTRAINT fk_assigned_reviewer FOREIGN KEY (assigned_reviewer_id) REFERENCES users(user_id),
    CONSTRAINT fk_reviewed_by FOREIGN KEY (reviewed_by_id) REFERENCES users(user_id),
    CONSTRAINT fk_physician FOREIGN KEY (physician_countersigned_by) REFERENCES users(user_id)
);

-- Create hypertable for time-series optimization
SELECT create_hypertable('pa_requests', 'created_at');

-- Indexes for performance
CREATE INDEX idx_pa_number ON pa_requests(pa_number);
CREATE INDEX idx_member_id ON pa_requests(member_id);
CREATE INDEX idx_status ON pa_requests(status);
CREATE INDEX idx_submitted_at ON pa_requests(submitted_at DESC);
CREATE INDEX idx_decision_deadline ON pa_requests(decision_deadline) WHERE decision_deadline IS NOT NULL;
CREATE INDEX idx_assigned_reviewer ON pa_requests(assigned_reviewer_id) WHERE assigned_reviewer_id IS NOT NULL;
CREATE INDEX idx_payer ON pa_requests(payer_id);
CREATE INDEX idx_provider_npi ON pa_requests(requesting_provider_npi);
CREATE INDEX idx_urgency ON pa_requests(urgency_level);

-- Composite indexes for common queries
CREATE INDEX idx_status_deadline ON pa_requests(status, decision_deadline);
CREATE INDEX idx_reviewer_status ON pa_requests(assigned_reviewer_id, status);

-- ================================================================
-- SUPPORTING ENTITIES
-- ================================================================

-- Payers
CREATE TABLE payers (
    payer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer_name VARCHAR(255) NOT NULL UNIQUE,
    payer_code VARCHAR(50) UNIQUE,
    payer_type VARCHAR(50), -- COMMERCIAL, MEDICARE, MEDICAID, EXCHANGE
    
    -- Integration Details
    integration_type VARCHAR(50), -- REST, FHIR, HL7, EDI, MANUAL
    api_endpoint TEXT,
    api_version VARCHAR(20),
    api_key_vault_path TEXT, -- Reference to encrypted key in Vault
    
    -- Business Rules
    sla_hours_routine INTEGER DEFAULT 72,
    sla_hours_urgent INTEGER DEFAULT 24,
    auto_approval_enabled BOOLEAN DEFAULT FALSE,
    requires_physician_review BOOLEAN DEFAULT TRUE,
    
    -- Contact Information
    support_phone VARCHAR(20),
    support_email VARCHAR(255),
    portal_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    integration_status VARCHAR(50), -- ACTIVE, INACTIVE, TESTING
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users (Clinical Reviewers, Providers, Admin)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    
    -- Professional Credentials
    npi VARCHAR(10) UNIQUE, -- For providers and clinical staff
    license_number VARCHAR(50),
    license_state VARCHAR(2),
    credentials VARCHAR(100), -- MD, RN, PharmD, etc.
    specialty VARCHAR(100),
    
    -- Role & Permissions
    role VARCHAR(50) NOT NULL, -- PROVIDER, CLINICAL_REVIEWER, PHYSICIAN, ADMIN
    permissions JSONB, -- Granular permissions array
    
    -- Organization
    organization_id UUID,
    department VARCHAR(100),
    
    -- Reviewer-specific
    review_capacity INTEGER, -- Max concurrent cases
    review_specialties JSONB, -- Array of specialty codes
    reviewer_level VARCHAR(50), -- RN, MD, SPECIALIST
    
    -- Authentication
    password_hash TEXT, -- For local auth (encrypted)
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT, -- Encrypted TOTP secret
    last_login_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- SSO
    sso_provider VARCHAR(50), -- OKTA, AZURE_AD, SAML
    sso_user_id VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(organization_id)
);

CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_npi ON users(npi);
CREATE INDEX idx_user_role ON users(role);
CREATE INDEX idx_user_active ON users(is_active);

-- Organizations (Provider Groups, Facilities)
CREATE TABLE organizations (
    organization_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    organization_name VARCHAR(255) NOT NULL,
    organization_type VARCHAR(50), -- PROVIDER_GROUP, HOSPITAL, CLINIC
    
    -- Identifiers
    npi VARCHAR(10),
    tax_id VARCHAR(20),
    organization_code VARCHAR(50),
    
    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(10),
    
    -- Contact
    phone VARCHAR(20),
    fax VARCHAR(20),
    email VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Clinical Documents
CREATE TABLE clinical_documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_id UUID NOT NULL,
    
    -- Document Metadata
    document_type VARCHAR(50) NOT NULL, -- CLINICAL_NOTE, LAB_RESULT, IMAGING, LETTER
    document_name VARCHAR(255),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    
    -- Storage
    storage_path TEXT NOT NULL, -- S3/Azure Blob path (encrypted)
    storage_bucket VARCHAR(255),
    encryption_key_id VARCHAR(255), -- KMS key reference
    
    -- OCR/Extraction
    ocr_text TEXT, -- Extracted text
    ocr_confidence DECIMAL(5,2),
    extracted_data JSONB, -- Structured data extraction
    
    -- Upload Info
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Virus Scan
    virus_scan_status VARCHAR(20), -- PENDING, CLEAN, INFECTED
    virus_scan_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_pa FOREIGN KEY (pa_id) REFERENCES pa_requests(pa_id),
    CONSTRAINT fk_uploader FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

CREATE INDEX idx_doc_pa ON clinical_documents(pa_id);
CREATE INDEX idx_doc_type ON clinical_documents(document_type);
CREATE INDEX idx_doc_uploaded ON clinical_documents(uploaded_at DESC);

-- Review Notes (Reviewer Comments)
CREATE TABLE review_notes (
    note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_id UUID NOT NULL,
    
    reviewer_id UUID NOT NULL,
    note_type VARCHAR(50), -- CLINICAL_ASSESSMENT, DENIAL_RATIONALE, PEND_REASON
    note_text TEXT NOT NULL,
    
    -- Visibility
    is_internal BOOLEAN DEFAULT FALSE, -- Internal note vs. provider-facing
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_pa_note FOREIGN KEY (pa_id) REFERENCES pa_requests(pa_id),
    CONSTRAINT fk_reviewer_note FOREIGN KEY (reviewer_id) REFERENCES users(user_id)
);

CREATE INDEX idx_review_pa ON review_notes(pa_id);
CREATE INDEX idx_review_reviewer ON review_notes(reviewer_id);

-- Appeals
CREATE TABLE appeals (
    appeal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_id UUID NOT NULL,
    
    -- Appeal Details
    appeal_type VARCHAR(50) NOT NULL, -- STANDARD, EXPEDITED, EXTERNAL
    appeal_reason TEXT NOT NULL,
    additional_documentation JSONB,
    
    -- Dates
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decision_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_at TIMESTAMP WITH TIME ZONE,
    
    -- Outcome
    appeal_decision VARCHAR(50), -- UPHELD, OVERTURNED, PARTIALLY_OVERTURNED
    appeal_rationale TEXT,
    
    -- Reviewer Assignment
    assigned_reviewer_id UUID,
    reviewed_by_id UUID,
    
    -- External Review (if applicable)
    external_review_organization VARCHAR(255),
    external_review_decision TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_pa_appeal FOREIGN KEY (pa_id) REFERENCES pa_requests(pa_id),
    CONSTRAINT fk_appeal_reviewer FOREIGN KEY (reviewed_by_id) REFERENCES users(user_id)
);

CREATE INDEX idx_appeal_pa ON appeals(pa_id);
CREATE INDEX idx_appeal_deadline ON appeals(decision_deadline);

-- ================================================================
-- REFERENCE DATA TABLES
-- ================================================================

-- ICD-10 Codes
CREATE TABLE icd10_codes (
    code VARCHAR(10) PRIMARY KEY,
    description TEXT NOT NULL,
    category VARCHAR(100),
    is_billable BOOLEAN DEFAULT TRUE,
    
    effective_date DATE,
    termination_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_icd10_desc ON icd10_codes USING gin(to_tsvector('english', description));

-- CPT Codes
CREATE TABLE cpt_codes (
    code VARCHAR(10) PRIMARY KEY,
    description TEXT NOT NULL,
    category VARCHAR(100),
    is_high_cost BOOLEAN DEFAULT FALSE,
    typical_cost_range VARCHAR(50),
    
    effective_date DATE,
    termination_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cpt_desc ON cpt_codes USING gin(to_tsvector('english', description));

-- NDC (National Drug Code) Catalog
CREATE TABLE ndc_codes (
    ndc_code VARCHAR(11) PRIMARY KEY,
    medication_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    dosage_form VARCHAR(100),
    strength VARCHAR(100),
    manufacturer VARCHAR(255),
    
    is_generic BOOLEAN DEFAULT FALSE,
    is_specialty BOOLEAN DEFAULT FALSE,
    dea_schedule VARCHAR(5), -- C-II, C-III, etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ndc_med_name ON ndc_codes USING gin(to_tsvector('english', medication_name));

-- ================================================================
-- CLINICAL CRITERIA REPOSITORY
-- ================================================================

-- Medical Necessity Criteria (MCG/InterQual)
CREATE TABLE clinical_criteria (
    criteria_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identification
    criteria_code VARCHAR(50) UNIQUE NOT NULL,
    criteria_name VARCHAR(255) NOT NULL,
    criteria_source VARCHAR(50), -- MCG, INTERQUAL, INTERNAL
    
    -- Clinical Context
    diagnosis_codes JSONB, -- Array of ICD-10 codes
    procedure_codes JSONB, -- Array of CPT codes
    specialty VARCHAR(100),
    
    -- Criteria Definition
    criteria_text TEXT NOT NULL,
    required_documentation JSONB,
    exclusion_criteria JSONB,
    
    -- Decision Support
    auto_approval_conditions JSONB,
    denial_conditions JSONB,
    
    -- Versioning
    version VARCHAR(20) NOT NULL,
    effective_date DATE NOT NULL,
    termination_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_criteria_code ON clinical_criteria(criteria_code);
CREATE INDEX idx_criteria_active ON clinical_criteria(is_active);

-- ================================================================
-- AUDIT & COMPLIANCE TABLES
-- ================================================================

-- PHI Access Audit Log (Immutable)
CREATE TABLE phi_access_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Access Details
    user_id UUID NOT NULL,
    pa_id UUID,
    patient_id VARCHAR(50), -- Hashed patient identifier
    
    -- Action
    action_type VARCHAR(50) NOT NULL, -- VIEW, CREATE, UPDATE, DELETE, EXPORT
    action_details TEXT,
    resource_type VARCHAR(50), -- PA_REQUEST, DOCUMENT, CLINICAL_NOTE
    resource_id UUID,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Result
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,
    
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- TimescaleDB hypertable for efficient time-series queries
SELECT create_hypertable('phi_access_log', 'accessed_at');

CREATE INDEX idx_audit_user ON phi_access_log(user_id);
CREATE INDEX idx_audit_pa ON phi_access_log(pa_id);
CREATE INDEX idx_audit_action ON phi_access_log(action_type);
CREATE INDEX idx_audit_time ON phi_access_log(accessed_at DESC);

-- Data Change Log (CDC for compliance)
CREATE TABLE data_change_log (
    change_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    
    operation VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    
    changed_by UUID NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_change_user FOREIGN KEY (changed_by) REFERENCES users(user_id)
);

SELECT create_hypertable('data_change_log', 'changed_at');

CREATE INDEX idx_change_table ON data_change_log(table_name);
CREATE INDEX idx_change_record ON data_change_log(record_id);

-- ================================================================
-- TRIGGERS FOR AUTO-UPDATE
-- ================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_pa_requests_updated_at BEFORE UPDATE ON pa_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- ROW-LEVEL SECURITY (RLS) FOR MULTI-TENANCY
-- ================================================================

-- Enable RLS on sensitive tables
ALTER TABLE pa_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_documents ENABLE ROW LEVEL SECURITY;

-- Example policy: Users can only see PAs assigned to them or their organization
CREATE POLICY pa_reviewer_access ON pa_requests
    FOR SELECT
    USING (
        assigned_reviewer_id = current_setting('app.current_user_id')::UUID OR
        requesting_provider_npi IN (
            SELECT npi FROM users 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- ================================================================
-- VIEWS FOR COMMON QUERIES
-- ================================================================

-- Active PA requests with reviewer info
CREATE VIEW v_active_pa_queue AS
SELECT 
    pr.pa_id,
    pr.pa_number,
    pr.patient_first_name,
    pr.patient_last_name,
    pr.member_id,
    pr.primary_diagnosis_code,
    pr.procedure_code,
    pr.status,
    pr.urgency_level,
    pr.ai_confidence_score,
    pr.decision_deadline,
    pr.submitted_at,
    u.first_name AS reviewer_first_name,
    u.last_name AS reviewer_last_name,
    p.payer_name,
    EXTRACT(EPOCH FROM (pr.decision_deadline - CURRENT_TIMESTAMP))/3600 AS hours_until_deadline
FROM pa_requests pr
LEFT JOIN users u ON pr.assigned_reviewer_id = u.user_id
LEFT JOIN payers p ON pr.payer_id = p.payer_id
WHERE pr.status IN ('IN_REVIEW', 'PENDING_INFO')
  AND pr.deleted_at IS NULL
ORDER BY pr.decision_deadline ASC;

-- Reviewer workload summary
CREATE VIEW v_reviewer_workload AS
SELECT 
    u.user_id,
    u.first_name,
    u.last_name,
    u.review_capacity,
    COUNT(pr.pa_id) AS assigned_cases,
    SUM(CASE WHEN pr.urgency_level = 'URGENT' THEN 1 ELSE 0 END) AS urgent_cases,
    SUM(CASE WHEN pr.decision_deadline < CURRENT_TIMESTAMP + INTERVAL '24 hours' THEN 1 ELSE 0 END) AS due_soon
FROM users u
LEFT JOIN pa_requests pr ON u.user_id = pr.assigned_reviewer_id 
    AND pr.status = 'IN_REVIEW'
WHERE u.role = 'CLINICAL_REVIEWER' AND u.is_active = TRUE
GROUP BY u.user_id, u.first_name, u.last_name, u.review_capacity;

-- ================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ================================================================

CREATE MATERIALIZED VIEW mv_daily_pa_metrics AS
SELECT 
    DATE(submitted_at) AS metric_date,
    payer_id,
    status,
    urgency_level,
    COUNT(*) AS request_count,
    AVG(ai_confidence_score) AS avg_ai_score,
    SUM(CASE WHEN decision_type = 'AUTO_APPROVED' THEN 1 ELSE 0 END) AS auto_approved_count,
    AVG(intake_to_decision_hours) AS avg_turnaround_hours
FROM pa_requests
WHERE deleted_at IS NULL
GROUP BY DATE(submitted_at), payer_id, status, urgency_level;

-- Refresh schedule (run daily via cron)
CREATE INDEX idx_mv_daily_metrics ON mv_daily_pa_metrics(metric_date DESC);

-- ================================================================
-- SAMPLE DATA INSERTS (For Testing)
-- ================================================================

-- Insert sample payers
INSERT INTO payers (payer_id, payer_name, payer_code, payer_type, integration_type, sla_hours_routine)
VALUES 
    (uuid_generate_v4(), 'UnitedHealthcare', 'UHC', 'COMMERCIAL', 'REST', 72),
    (uuid_generate_v4(), 'Aetna', 'AETNA', 'COMMERCIAL', 'FHIR', 72),
    (uuid_generate_v4(), 'CVS Caremark', 'CVS', 'COMMERCIAL', 'REST', 48);

-- ================================================================
-- GRANT PERMISSIONS
-- ================================================================

-- Create application roles
CREATE ROLE pa_app_readonly;
CREATE ROLE pa_app_readwrite;
CREATE ROLE pa_app_admin;

-- Grant read-only permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pa_app_readonly;

-- Grant read-write permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pa_app_readwrite;

-- Grant admin permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pa_app_admin;

-- ================================================================
-- END OF CLINICAL DATABASE SCHEMA
-- ================================================================
