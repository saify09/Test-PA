-- ============================================================
-- PA System — PostgreSQL 16 Schema
-- HIPAA-compliant with AES-256 encrypted PHI columns,
-- full audit trail, row-level security, and partitioning.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy search on non-PHI fields

-- ── Schemas ───────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS pa;       -- core PA data
CREATE SCHEMA IF NOT EXISTS audit;    -- HIPAA audit trail (append-only)
CREATE SCHEMA IF NOT EXISTS ref;      -- reference / lookup tables

SET search_path = pa, audit, ref, public;

-- ── Reference tables ──────────────────────────────────────────────────────────
CREATE TABLE ref.payers (
    code          VARCHAR(20) PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    integration   VARCHAR(20) DEFAULT 'EDI',     -- REST_API | EDI_278
    active        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ref.payers VALUES
  ('UHC',   'UnitedHealthcare',     'REST_API', TRUE, NOW()),
  ('AETNA', 'Aetna',               'REST_API', TRUE, NOW()),
  ('BCBS',  'Blue Cross Blue Shield','EDI_278', TRUE, NOW()),
  ('CIGNA', 'Cigna',               'EDI_278',  TRUE, NOW()),
  ('CVS',   'CVS Caremark',        'REST_API', TRUE, NOW());

CREATE TABLE ref.service_types (
    code        VARCHAR(50) PRIMARY KEY,
    description VARCHAR(200),
    sla_hours   INT DEFAULT 72,
    requires_md BOOLEAN DEFAULT FALSE
);

INSERT INTO ref.service_types VALUES
  ('DIAGNOSTIC_IMAGING',   'Diagnostic Imaging (MRI/CT/X-Ray)', 72, FALSE),
  ('SURGICAL_PROCEDURE',   'Surgical Procedure',                 72, TRUE),
  ('SPECIALTY_MEDICATION', 'Specialty Medication/Biologic',      72, FALSE),
  ('PHYSICAL_THERAPY',     'Physical Therapy',                   72, FALSE),
  ('DME',                  'Durable Medical Equipment',          72, FALSE),
  ('BEHAVIORAL_HEALTH',    'Behavioral Health Services',         72, FALSE),
  ('INPATIENT',            'Inpatient Admission',                24, TRUE),
  ('OUTPATIENT',           'Outpatient Services',               72, FALSE),
  ('HOME_HEALTH',          'Home Health Services',               72, FALSE),
  ('OTHER',                'Other Services',                    72, FALSE);

CREATE TABLE ref.denial_reason_codes (
    code        VARCHAR(20) PRIMARY KEY,
    description VARCHAR(300) NOT NULL,
    category    VARCHAR(50),
    appealable  BOOLEAN DEFAULT TRUE
);

INSERT INTO ref.denial_reason_codes VALUES
  ('MN001', 'Not medically necessary based on submitted clinical information', 'MEDICAL_NECESSITY', TRUE),
  ('MN002', 'Step therapy requirements not completed', 'MEDICAL_NECESSITY', TRUE),
  ('MN003', 'Clinical documentation insufficient', 'DOCUMENTATION', TRUE),
  ('MN004', 'Diagnosis does not support requested service', 'MEDICAL_NECESSITY', TRUE),
  ('COV001', 'Service not covered under member benefit plan', 'COVERAGE', FALSE),
  ('COV002', 'Non-formulary medication requested', 'COVERAGE', TRUE),
  ('COV003', 'Out-of-network provider', 'COVERAGE', TRUE),
  ('ADMIN001', 'Duplicate request — active PA already exists', 'ADMINISTRATIVE', FALSE),
  ('ADMIN002', 'Missing required clinical information', 'ADMINISTRATIVE', TRUE),
  ('ADMIN003', 'Provider not credentialed with plan', 'ADMINISTRATIVE', TRUE);

-- ── Users / Reviewers ─────────────────────────────────────────────────────────
CREATE TABLE pa.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    -- PHI encrypted at rest
    full_name_enc   TEXT NOT NULL,
    role            VARCHAR(50) NOT NULL,
    npi             VARCHAR(10),
    specialty       VARCHAR(100),
    active          BOOLEAN DEFAULT TRUE,
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    mfa_secret_enc  TEXT,
    password_hash   TEXT NOT NULL,
    last_login      TIMESTAMPTZ,
    failed_logins   INT DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT role_valid CHECK (role IN (
        'PROVIDER','REVIEWER_RN','REVIEWER_MD','MEDICAL_DIRECTOR',
        'OPS_ADMIN','ADMIN','SUPER_ADMIN','MEMBER'
    ))
);

CREATE INDEX idx_users_role ON pa.users(role) WHERE active = TRUE;
CREATE INDEX idx_users_npi  ON pa.users(npi) WHERE npi IS NOT NULL;

-- ── PA Cases (core table) ─────────────────────────────────────────────────────
CREATE TABLE pa.cases (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_number               VARCHAR(30) UNIQUE NOT NULL,

    -- Member (ALL PHI encrypted AES-256-GCM)
    member_id_enc           TEXT NOT NULL,
    member_name_enc         TEXT NOT NULL,
    member_dob_enc          TEXT NOT NULL,
    member_gender           CHAR(1),
    payer                   VARCHAR(20) NOT NULL REFERENCES ref.payers(code),

    -- Provider
    provider_npi            VARCHAR(10) NOT NULL,
    provider_name           VARCHAR(200),
    provider_tax_id         VARCHAR(20),
    facility_npi            VARCHAR(10),

    -- Clinical
    primary_dx_code         VARCHAR(20) NOT NULL,
    secondary_dx_codes      TEXT[],
    primary_proc_code       VARCHAR(20) NOT NULL,
    additional_proc_codes   TEXT[],
    service_type            VARCHAR(50) REFERENCES ref.service_types(code),
    place_of_service        VARCHAR(5) DEFAULT '11',
    requested_units         INT DEFAULT 1,
    requested_start_date    DATE,
    clinical_summary_enc    TEXT,
    urgency                 VARCHAR(20) DEFAULT 'ROUTINE',
    source_channel          VARCHAR(20) DEFAULT 'PORTAL',

    -- Status
    status                  VARCHAR(30) DEFAULT 'SUBMITTED',
    assigned_reviewer_id    UUID REFERENCES pa.users(id),
    sla_deadline            TIMESTAMPTZ NOT NULL,
    sla_breached            BOOLEAN GENERATED ALWAYS AS (
                                sla_deadline < NOW() AND status NOT IN ('APPROVED','DENIED','AUTO_APPROVED','AUTO_DENIED','CANCELLED')
                            ) STORED,

    -- AI output
    ai_confidence           NUMERIC(5,4),
    ai_recommendation       VARCHAR(20),
    ai_route_decision       VARCHAR(20),
    ai_model_version        VARCHAR(20),
    ai_processed_at         TIMESTAMPTZ,

    -- Payer submission
    payer_ref_number        VARCHAR(60),
    payer_submitted_at      TIMESTAMPTZ,

    -- Timestamps
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decision_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT status_valid CHECK (status IN (
        'SUBMITTED','IN_REVIEW','PENDING_INFO','APPROVED','DENIED',
        'AUTO_APPROVED','AUTO_DENIED','PENDED','CANCELLED','EXPIRED'
    )),
    CONSTRAINT urgency_valid CHECK (urgency IN ('ROUTINE','URGENT','EMERGENCY','EXPEDITED'))
) PARTITION BY RANGE (submitted_at);

-- Monthly partitions (2026)
CREATE TABLE pa.cases_2026_01 PARTITION OF pa.cases FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE pa.cases_2026_02 PARTITION OF pa.cases FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE pa.cases_2026_03 PARTITION OF pa.cases FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE pa.cases_2026_04 PARTITION OF pa.cases FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE pa.cases_2026_05 PARTITION OF pa.cases FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE pa.cases_2026_06 PARTITION OF pa.cases FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE pa.cases_2026_q3  PARTITION OF pa.cases FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE pa.cases_2026_q4  PARTITION OF pa.cases FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE pa.cases_default  PARTITION OF pa.cases DEFAULT;

-- Indexes (on parent — propagate to all partitions)
CREATE INDEX idx_cases_pa_number     ON pa.cases(pa_number);
CREATE INDEX idx_cases_payer_status  ON pa.cases(payer, status);
CREATE INDEX idx_cases_submitted_at  ON pa.cases(submitted_at DESC);
CREATE INDEX idx_cases_reviewer      ON pa.cases(assigned_reviewer_id) WHERE assigned_reviewer_id IS NOT NULL;
CREATE INDEX idx_cases_sla_breach    ON pa.cases(sla_deadline) WHERE status IN ('SUBMITTED','IN_REVIEW','PENDING_INFO');
CREATE INDEX idx_cases_ai_confidence ON pa.cases(ai_confidence) WHERE ai_confidence IS NOT NULL;
CREATE INDEX idx_cases_provider_npi  ON pa.cases(provider_npi);

-- ── PA Decisions ──────────────────────────────────────────────────────────────
CREATE TABLE pa.decisions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id                 UUID NOT NULL REFERENCES pa.cases(id) ON DELETE CASCADE,
    pa_number               VARCHAR(30) NOT NULL,

    decision                VARCHAR(30) NOT NULL,
    is_auto                 BOOLEAN DEFAULT FALSE,
    auth_number             VARCHAR(50),
    auth_start_date         DATE,
    auth_end_date           DATE,
    approved_units          INT,

    -- Denial
    denial_reason_code      VARCHAR(20) REFERENCES ref.denial_reason_codes(code),
    denial_reason_text      TEXT,

    -- Reviewer
    reviewer_id             UUID REFERENCES pa.users(id),
    reviewer_notes          TEXT,
    md_cosign_id            UUID REFERENCES pa.users(id),
    md_cosign_at            TIMESTAMPTZ,

    -- AI tracking
    ai_agreed               BOOLEAN,
    ai_confidence_at_decision NUMERIC(5,4),

    -- Payer acknowledgment
    payer_auth_number       VARCHAR(50),
    payer_acknowledged_at   TIMESTAMPTZ,

    decided_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT decision_valid CHECK (decision IN (
        'APPROVED','DENIED','AUTO_APPROVED','AUTO_DENIED','PENDED',
        'IN_REVIEW','PENDING_INFO','CANCELLED'
    ))
);

CREATE INDEX idx_decisions_case_id   ON pa.decisions(case_id);
CREATE INDEX idx_decisions_pa_number ON pa.decisions(pa_number);
CREATE INDEX idx_decisions_decided_at ON pa.decisions(decided_at DESC);
CREATE INDEX idx_decisions_auth_number ON pa.decisions(auth_number) WHERE auth_number IS NOT NULL;

-- ── Appeals ───────────────────────────────────────────────────────────────────
CREATE TABLE pa.appeals (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_number           VARCHAR(30) UNIQUE NOT NULL,
    case_id                 UUID NOT NULL REFERENCES pa.cases(id),
    original_decision_id    UUID NOT NULL REFERENCES pa.decisions(id),

    appeal_type             VARCHAR(30) NOT NULL,
    status                  VARCHAR(30) DEFAULT 'SUBMITTED',
    channel                 VARCHAR(20) DEFAULT 'PORTAL',
    appellant_type          VARCHAR(20) DEFAULT 'PROVIDER',
    appellant_id            TEXT NOT NULL,
    appellant_name_enc      TEXT NOT NULL,     -- PHI encrypted
    appellant_phone_enc     TEXT,
    appellant_fax           TEXT,

    reason_text             TEXT NOT NULL,
    additional_info         TEXT,
    document_ids            TEXT[],
    urgency_justification   TEXT,

    -- Review
    reviewer_id             UUID REFERENCES pa.users(id),
    reviewer_notes          TEXT,
    decision                VARCHAR(30),
    decision_notes          TEXT,
    overturned              BOOLEAN,
    md_cosign_id            UUID REFERENCES pa.users(id),

    -- Regulatory
    regulatory_deadline     TIMESTAMPTZ NOT NULL,
    external_review_org     VARCHAR(100),

    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT appeal_type_valid CHECK (appeal_type IN ('STANDARD','EXPEDITED','EXTERNAL','PEER_TO_PEER')),
    CONSTRAINT appeal_status_valid CHECK (status IN (
        'SUBMITTED','ACKNOWLEDGED','IN_REVIEW','PENDING_INFO','DECIDED','ESCALATED','WITHDRAWN','CLOSED'
    ))
);

CREATE INDEX idx_appeals_case_id    ON pa.appeals(case_id);
CREATE INDEX idx_appeals_status     ON pa.appeals(status);
CREATE INDEX idx_appeals_deadline   ON pa.appeals(regulatory_deadline) WHERE status NOT IN ('DECIDED','CLOSED','WITHDRAWN');

-- ── Documents ─────────────────────────────────────────────────────────────────
CREATE TABLE pa.documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id         VARCHAR(50) UNIQUE NOT NULL,
    case_id             UUID REFERENCES pa.cases(id),
    pa_number           VARCHAR(30),

    filename            VARCHAR(500) NOT NULL,
    doc_type            VARCHAR(50) DEFAULT 'OTHER',
    mime_type           VARCHAR(100),
    file_size_bytes     BIGINT,
    s3_key              TEXT,
    sha256_hash         VARCHAR(64),

    -- Extraction results
    status              VARCHAR(30) DEFAULT 'UPLOADED',
    ocr_required        BOOLEAN DEFAULT FALSE,
    ocr_confidence      NUMERIC(5,4),
    extraction_confidence NUMERIC(5,4),
    diagnoses_found     TEXT[],
    procedures_found    TEXT[],
    medications_found   TEXT[],

    uploader_id         UUID REFERENCES pa.users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,     -- soft delete (HIPAA retention)

    CONSTRAINT doc_status_valid CHECK (status IN (
        'UPLOADED','SCANNING','CLEAN','INFECTED','PROCESSING','EXTRACTED','FAILED'
    ))
);

CREATE INDEX idx_documents_case_id   ON pa.documents(case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_pa_number ON pa.documents(pa_number) WHERE deleted_at IS NULL;

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE pa.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_number       VARCHAR(30),
    event_type      VARCHAR(50) NOT NULL,
    recipient_type  VARCHAR(20) NOT NULL,
    recipient_id    TEXT NOT NULL,
    template_id     VARCHAR(50) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    language        VARCHAR(5) DEFAULT 'en',
    status          VARCHAR(20) DEFAULT 'QUEUED',
    attempts        INT DEFAULT 0,
    last_error      TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_pa     ON pa.notifications(pa_number);
CREATE INDEX idx_notifications_status ON pa.notifications(status) WHERE status IN ('QUEUED','FAILED');

-- ══════════════════════════════════════════════════════════════════════════════
-- AUDIT SCHEMA (HIPAA §164.312(b) — append-only, no DELETE, no UPDATE)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE audit.logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id         UUID,
    pa_number       VARCHAR(30),
    user_id         UUID,
    user_name_enc   TEXT,      -- encrypted
    user_role       VARCHAR(50),
    action          VARCHAR(50) NOT NULL,
    resource        VARCHAR(50) NOT NULL,
    resource_id     VARCHAR(100),
    details         TEXT,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    result          VARCHAR(20) DEFAULT 'SUCCESS',
    phi_accessed    BOOLEAN DEFAULT FALSE,
    phi_fields      VARCHAR(500),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Quarterly partitions for audit log
CREATE TABLE audit.logs_2026_q1 PARTITION OF audit.logs FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE audit.logs_2026_q2 PARTITION OF audit.logs FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE audit.logs_2026_q3 PARTITION OF audit.logs FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE audit.logs_2026_q4 PARTITION OF audit.logs FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE audit.logs_default  PARTITION OF audit.logs DEFAULT;

CREATE INDEX idx_audit_user_ts   ON audit.logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_action_ts ON audit.logs(action, timestamp DESC);
CREATE INDEX idx_audit_pa_number ON audit.logs(pa_number) WHERE pa_number IS NOT NULL;
CREATE INDEX idx_audit_phi       ON audit.logs(timestamp DESC) WHERE phi_accessed = TRUE;

-- Prevent updates/deletes on audit table (HIPAA tamper-evidence)
CREATE RULE audit_no_update AS ON UPDATE TO audit.logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit.logs DO INSTEAD NOTHING;

-- ── Triggers ──────────────────────────────────────────────────────────────────
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION pa.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_updated_at BEFORE UPDATE ON pa.cases
    FOR EACH ROW EXECUTE FUNCTION pa.set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON pa.users
    FOR EACH ROW EXECUTE FUNCTION pa.set_updated_at();

-- Auto-insert audit log on case status change
CREATE OR REPLACE FUNCTION pa.audit_case_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit.logs(pa_number, action, resource, resource_id,
                               details, phi_accessed)
        VALUES (NEW.pa_number, 'STATUS_CHANGE', 'pa_case', NEW.id::TEXT,
                format('Status: %s → %s', OLD.status, NEW.status), TRUE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_case_status_audit AFTER UPDATE ON pa.cases
    FOR EACH ROW EXECUTE FUNCTION pa.audit_case_status_change();

-- ── Views ─────────────────────────────────────────────────────────────────────
-- KPI dashboard view (no PHI exposed)
CREATE OR REPLACE VIEW pa.v_kpi_daily AS
SELECT
    DATE_TRUNC('day', submitted_at) AS day,
    payer,
    service_type,
    urgency,
    COUNT(*) AS total_submitted,
    COUNT(*) FILTER (WHERE status IN ('APPROVED','AUTO_APPROVED')) AS approved,
    COUNT(*) FILTER (WHERE status IN ('DENIED','AUTO_DENIED'))     AS denied,
    COUNT(*) FILTER (WHERE status IN ('IN_REVIEW','SUBMITTED'))    AS pending,
    COUNT(*) FILTER (WHERE ai_route_decision = 'AUTO_APPROVE')     AS auto_approved,
    ROUND(AVG(ai_confidence)::NUMERIC, 4)                          AS avg_ai_confidence,
    COUNT(*) FILTER (WHERE sla_breached)                           AS sla_breached_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (decision_at - submitted_at))/3600)::NUMERIC, 1) AS avg_tat_hours
FROM pa.cases
WHERE submitted_at >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2, 3, 4;

-- Reviewer workload view
CREATE OR REPLACE VIEW pa.v_reviewer_queue AS
SELECT
    u.id AS reviewer_id,
    u.role,
    COUNT(c.id) AS assigned_cases,
    COUNT(c.id) FILTER (WHERE c.urgency = 'EMERGENCY') AS emergency_count,
    COUNT(c.id) FILTER (WHERE c.urgency = 'URGENT')    AS urgent_count,
    COUNT(c.id) FILTER (WHERE c.sla_breached)          AS sla_at_risk,
    MIN(c.sla_deadline) AS earliest_deadline
FROM pa.users u
LEFT JOIN pa.cases c ON c.assigned_reviewer_id = u.id
    AND c.status IN ('IN_REVIEW', 'SUBMITTED')
WHERE u.active = TRUE AND u.role IN ('REVIEWER_RN','REVIEWER_MD','MEDICAL_DIRECTOR')
GROUP BY u.id, u.role;

-- SLA compliance view
CREATE OR REPLACE VIEW pa.v_sla_compliance AS
SELECT
    payer,
    service_type,
    urgency,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE NOT sla_breached OR status IN ('APPROVED','DENIED','AUTO_APPROVED','AUTO_DENIED')) AS compliant,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE NOT sla_breached OR status IN ('APPROVED','DENIED','AUTO_APPROVED','AUTO_DENIED'))
        / NULLIF(COUNT(*), 0), 1
    ) AS compliance_pct
FROM pa.cases
WHERE submitted_at >= NOW() - INTERVAL '30 days'
GROUP BY payer, service_type, urgency;

-- ── Row-level security ─────────────────────────────────────────────────────────
ALTER TABLE pa.cases ENABLE ROW LEVEL SECURITY;

-- Providers see only their own cases (by NPI in application session variable)
CREATE POLICY cases_provider_isolation ON pa.cases
    USING (provider_npi = current_setting('app.provider_npi', TRUE) OR
           current_setting('app.user_role', TRUE) IN ('ADMIN','SUPER_ADMIN','MEDICAL_DIRECTOR','OPS_ADMIN'));

-- ── Roles & Permissions ───────────────────────────────────────────────────────
CREATE ROLE pa_api_user LOGIN PASSWORD 'change_in_production';
GRANT CONNECT ON DATABASE pa_system TO pa_api_user;
GRANT USAGE ON SCHEMA pa, audit, ref TO pa_api_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA pa TO pa_api_user;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO pa_api_user;  -- audit: insert only
GRANT SELECT ON ALL TABLES IN SCHEMA ref TO pa_api_user;
GRANT SELECT ON pa.v_kpi_daily, pa.v_reviewer_queue, pa.v_sla_compliance TO pa_api_user;

CREATE ROLE pa_readonly LOGIN PASSWORD 'change_in_production';
GRANT CONNECT ON DATABASE pa_system TO pa_readonly;
GRANT USAGE ON SCHEMA pa, audit, ref TO pa_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA pa, audit, ref TO pa_readonly;

-- ── HIPAA retention policy annotation ────────────────────────────────────────
COMMENT ON TABLE pa.cases       IS 'Core PA cases — PHI encrypted. Retain 7 years per HIPAA.';
COMMENT ON TABLE pa.decisions   IS 'PA decisions — retain 7 years.';
COMMENT ON TABLE audit.logs     IS 'HIPAA audit trail — append-only, retain 6 years minimum.';
COMMENT ON TABLE pa.documents   IS 'Clinical documents — soft-delete, retain 7 years.';


-- ══════════════════════════════════════════════════════════════════════════════
-- ANALYTICS SCHEMA (from original project — retained for compatibility)
-- Mirrors original analytics-db-schema structure in unified DB
-- ══════════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE analytics.fact_pa_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_number       VARCHAR(30) NOT NULL,
    payer           VARCHAR(20),
    service_type    VARCHAR(50),
    urgency         VARCHAR(20),
    status          VARCHAR(30),
    ai_confidence   NUMERIC(5,4),
    ai_recommendation VARCHAR(20),
    auto_decided    BOOLEAN DEFAULT FALSE,
    tat_hours       NUMERIC(8,2),
    sla_met         BOOLEAN,
    submitted_at    TIMESTAMPTZ,
    decided_at      TIMESTAMPTZ,
    snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX idx_fact_pa_date ON analytics.fact_pa_metrics(snapshot_date DESC);

CREATE TABLE analytics.ai_model_performance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version   VARCHAR(20) NOT NULL,
    eval_date       DATE NOT NULL,
    total_cases     INT DEFAULT 0,
    correct         INT DEFAULT 0,
    accuracy        NUMERIC(5,4),
    precision_score NUMERIC(5,4),
    recall_score    NUMERIC(5,4),
    f1_score        NUMERIC(5,4),
    avg_confidence  NUMERIC(5,4),
    auto_approve_rate NUMERIC(5,4),
    overturn_rate   NUMERIC(5,4)
);

CREATE TABLE analytics.provider_analytics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_npi    VARCHAR(10) NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    total_requests  INT DEFAULT 0,
    approved        INT DEFAULT 0,
    denied          INT DEFAULT 0,
    approval_rate   NUMERIC(5,4),
    avg_tat_hours   NUMERIC(8,2),
    documentation_quality_avg NUMERIC(5,4)
);

CREATE TABLE analytics.payer_analytics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer           VARCHAR(20) NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    total_requests  INT DEFAULT 0,
    auto_approved   INT DEFAULT 0,
    auto_denied     INT DEFAULT 0,
    manual_reviewed INT DEFAULT 0,
    avg_tat_hours   NUMERIC(8,2),
    sla_compliance  NUMERIC(5,4)
);

CREATE TABLE analytics.reviewer_productivity (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id     UUID REFERENCES pa.users(id),
    review_date     DATE NOT NULL,
    cases_reviewed  INT DEFAULT 0,
    avg_review_mins NUMERIC(8,2),
    approve_rate    NUMERIC(5,4),
    ai_agreement_rate NUMERIC(5,4),
    overturn_rate   NUMERIC(5,4)
);

CREATE TABLE analytics.ml_predictions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pa_number       VARCHAR(30) NOT NULL,
    model_version   VARCHAR(20),
    predicted_label VARCHAR(20),
    confidence      NUMERIC(5,4),
    actual_label    VARCHAR(20),
    correct         BOOLEAN,
    inference_ms    INT,
    predicted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ml_predictions_pa ON analytics.ml_predictions(pa_number);

GRANT USAGE ON SCHEMA analytics TO pa_api_user;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA analytics TO pa_api_user;
