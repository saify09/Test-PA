-- ================================================================
-- ANALYTICS DATABASE SCHEMA (DE-IDENTIFIED DATA)
-- PostgreSQL 15+ for Business Intelligence & Reporting
-- ================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ================================================================
-- PA METRICS & AGGREGATIONS
-- ================================================================

-- Daily PA Metrics (Star Schema Fact Table)
CREATE TABLE fact_pa_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    
    -- Date Dimension
    date_key INTEGER NOT NULL, -- YYYYMMDD format
    metric_date DATE NOT NULL,
    day_of_week INTEGER, -- 1-7
    week_of_year INTEGER,
    month INTEGER,
    quarter INTEGER,
    year INTEGER,
    
    -- PA Attributes (De-identified)
    pa_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of PA number
    payer_id UUID,
    payer_name VARCHAR(255),
    provider_specialty VARCHAR(100),
    provider_state VARCHAR(2),
    diagnosis_category VARCHAR(100), -- High-level category, not specific code
    procedure_category VARCHAR(100),
    service_type VARCHAR(50), -- MEDICAL, PHARMACY, DME
    
    -- Request Characteristics
    urgency_level VARCHAR(20),
    request_source VARCHAR(50),
    complexity_score DECIMAL(5,2),
    
    -- AI Metrics
    ai_model_version VARCHAR(50),
    ai_confidence_score DECIMAL(5,2),
    ai_recommendation VARCHAR(20),
    ai_processing_time_ms INTEGER,
    
    -- Decision Metrics
    final_decision VARCHAR(50),
    decision_type VARCHAR(50), -- AUTO_APPROVED, HUMAN_APPROVED, DENIED
    decision_rationale_category VARCHAR(100),
    reviewer_specialty VARCHAR(100),
    physician_review_required BOOLEAN,
    
    -- Timing Metrics (in hours)
    intake_to_ai_hours DECIMAL(10,2),
    ai_to_assignment_hours DECIMAL(10,2),
    assignment_to_review_hours DECIMAL(10,2),
    review_to_decision_hours DECIMAL(10,2),
    total_turnaround_hours DECIMAL(10,2),
    
    -- Outcome Metrics
    was_appealed BOOLEAN DEFAULT FALSE,
    appeal_outcome VARCHAR(50),
    was_overturned BOOLEAN DEFAULT FALSE,
    
    -- Quality Flags
    missing_documentation BOOLEAN,
    required_pended BOOLEAN,
    expedited_review BOOLEAN,
    
    -- Cost Impact (estimated)
    estimated_service_cost DECIMAL(12,2),
    cost_category VARCHAR(50), -- LOW, MEDIUM, HIGH
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create hypertable for time-series optimization
SELECT create_hypertable('fact_pa_metrics', 'metric_date');

-- Indexes for common query patterns
CREATE INDEX idx_fact_date ON fact_pa_metrics(metric_date DESC);
CREATE INDEX idx_fact_payer ON fact_pa_metrics(payer_id);
CREATE INDEX idx_fact_decision ON fact_pa_metrics(final_decision);
CREATE INDEX idx_fact_ai_score ON fact_pa_metrics(ai_confidence_score);
CREATE INDEX idx_fact_specialty ON fact_pa_metrics(provider_specialty);
CREATE INDEX idx_fact_appeals ON fact_pa_metrics(was_appealed) WHERE was_appealed = TRUE;

-- ================================================================
-- AI PERFORMANCE TRACKING
-- ================================================================

CREATE TABLE ai_model_performance (
    performance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Model Identification
    model_version VARCHAR(50) NOT NULL,
    model_type VARCHAR(50), -- NLP, CLASSIFIER, CONFIDENCE_SCORER
    
    -- Time Period
    evaluation_date DATE NOT NULL,
    evaluation_period VARCHAR(20), -- DAILY, WEEKLY, MONTHLY
    
    -- Volume Metrics
    total_predictions INTEGER NOT NULL,
    auto_approved_count INTEGER,
    sent_to_review_count INTEGER,
    
    -- Accuracy Metrics
    true_positives INTEGER,
    false_positives INTEGER,
    true_negatives INTEGER,
    false_negatives INTEGER,
    accuracy_rate DECIMAL(5,2),
    precision_rate DECIMAL(5,2),
    recall_rate DECIMAL(5,2),
    f1_score DECIMAL(5,2),
    
    -- Confidence Calibration
    avg_confidence_score DECIMAL(5,2),
    confidence_calibration_error DECIMAL(5,2),
    
    -- Agreement with Human Reviewers
    human_agreement_rate DECIMAL(5,2),
    overturn_rate DECIMAL(5,2),
    
    -- Bias Detection (Demographic Fairness)
    demographic_parity_difference DECIMAL(5,2),
    equalized_odds_difference DECIMAL(5,2),
    
    -- Performance by Confidence Band
    high_confidence_accuracy DECIMAL(5,2), -- >90%
    medium_confidence_accuracy DECIMAL(5,2), -- 70-90%
    low_confidence_accuracy DECIMAL(5,2), -- <70%
    
    -- Drift Detection
    feature_drift_score DECIMAL(5,2),
    concept_drift_detected BOOLEAN,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_perf_model ON ai_model_performance(model_version);
CREATE INDEX idx_ai_perf_date ON ai_model_performance(evaluation_date DESC);

-- ================================================================
-- PROVIDER ANALYTICS
-- ================================================================

CREATE TABLE provider_analytics (
    analytics_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Provider Identification (De-identified)
    provider_hash VARCHAR(64) NOT NULL, -- SHA-256 of NPI
    specialty VARCHAR(100),
    state VARCHAR(2),
    facility_type VARCHAR(50),
    
    -- Time Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Volume Metrics
    total_pa_submitted INTEGER,
    unique_patients INTEGER, -- De-identified count
    
    -- Approval Metrics
    approved_count INTEGER,
    denied_count INTEGER,
    pended_count INTEGER,
    approval_rate DECIMAL(5,2),
    
    -- Timing Metrics
    avg_turnaround_hours DECIMAL(10,2),
    median_turnaround_hours DECIMAL(10,2),
    p95_turnaround_hours DECIMAL(10,2),
    
    -- Quality Metrics
    complete_submission_rate DECIMAL(5,2), -- % with all required docs
    appeal_rate DECIMAL(5,2),
    overturn_rate DECIMAL(5,2),
    
    -- Top Procedures (Anonymized)
    top_procedure_categories JSONB,
    top_diagnosis_categories JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_hash ON provider_analytics(provider_hash);
CREATE INDEX idx_provider_period ON provider_analytics(period_start, period_end);

-- ================================================================
-- PAYER ANALYTICS
-- ================================================================

CREATE TABLE payer_analytics (
    analytics_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    payer_id UUID NOT NULL,
    payer_name VARCHAR(255),
    
    -- Time Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Volume Metrics
    total_pa_received INTEGER,
    total_pa_processed INTEGER,
    
    -- Outcome Distribution
    auto_approved_count INTEGER,
    human_approved_count INTEGER,
    denied_count INTEGER,
    pended_count INTEGER,
    
    -- Performance Metrics
    avg_turnaround_hours DECIMAL(10,2),
    sla_compliance_rate DECIMAL(5,2),
    
    -- Integration Health
    api_success_rate DECIMAL(5,2),
    avg_api_response_time_ms INTEGER,
    integration_error_count INTEGER,
    
    -- Financial Impact (Estimated)
    estimated_total_cost DECIMAL(15,2),
    estimated_savings_from_ai DECIMAL(15,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payer_analytics ON payer_analytics(payer_id);
CREATE INDEX idx_payer_period ON payer_analytics(period_start, period_end);

-- ================================================================
-- REVIEWER PRODUCTIVITY
-- ================================================================

CREATE TABLE reviewer_productivity (
    productivity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reviewer Identification (De-identified)
    reviewer_hash VARCHAR(64) NOT NULL,
    reviewer_role VARCHAR(50), -- RN, MD, SPECIALIST
    specialty VARCHAR(100),
    
    -- Date
    date DATE NOT NULL,
    
    -- Volume Metrics
    cases_reviewed INTEGER,
    cases_approved INTEGER,
    cases_denied INTEGER,
    cases_pended INTEGER,
    
    -- Timing Metrics
    avg_review_time_minutes DECIMAL(10,2),
    total_active_time_minutes INTEGER,
    
    -- Quality Metrics
    ai_agreement_rate DECIMAL(5,2),
    appeal_rate_on_denials DECIMAL(5,2),
    overturn_rate DECIMAL(5,2),
    
    -- Complexity
    avg_case_complexity DECIMAL(5,2),
    high_complexity_cases INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviewer_hash ON reviewer_productivity(reviewer_hash);
CREATE INDEX idx_reviewer_date ON reviewer_productivity(date DESC);

-- ================================================================
-- OPERATIONAL DASHBOARDS
-- ================================================================

-- Real-time Queue Metrics (Refreshed every 5 minutes)
CREATE TABLE queue_metrics_snapshot (
    snapshot_id BIGSERIAL PRIMARY KEY,
    snapshot_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Queue Depth
    total_pending INTEGER,
    urgent_pending INTEGER,
    routine_pending INTEGER,
    
    -- Aging Analysis
    overdue_count INTEGER,
    due_within_24h INTEGER,
    due_within_48h INTEGER,
    
    -- By Payer
    queue_by_payer JSONB,
    
    -- By Specialty
    queue_by_specialty JSONB,
    
    -- Reviewer Availability
    available_reviewers INTEGER,
    reviewers_at_capacity INTEGER,
    
    -- Predicted Metrics
    predicted_sla_breach_24h INTEGER
);

SELECT create_hypertable('queue_metrics_snapshot', 'snapshot_time');

CREATE INDEX idx_queue_snapshot ON queue_metrics_snapshot(snapshot_time DESC);

-- ================================================================
-- COMPLIANCE & AUDIT SUMMARY
-- ================================================================

CREATE TABLE compliance_metrics (
    metric_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    metric_date DATE NOT NULL,
    
    -- HIPAA Compliance
    phi_access_events INTEGER,
    unauthorized_access_attempts INTEGER,
    access_policy_violations INTEGER,
    
    -- Data Security
    encryption_failures INTEGER,
    data_breach_incidents INTEGER,
    
    -- Audit Trail
    audit_log_entries INTEGER,
    audit_log_gaps_detected INTEGER,
    
    -- Regulatory Compliance
    sla_breaches INTEGER,
    regulatory_deadline_misses INTEGER,
    
    -- User Access
    active_users INTEGER,
    mfa_compliance_rate DECIMAL(5,2),
    password_policy_violations INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compliance_date ON compliance_metrics(metric_date DESC);

-- ================================================================
-- BUSINESS INTELLIGENCE VIEWS
-- ================================================================

-- Daily KPI Summary
CREATE VIEW v_daily_kpis AS
SELECT 
    metric_date,
    COUNT(DISTINCT pa_hash) AS total_pas,
    SUM(CASE WHEN final_decision = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN final_decision = 'DENIED' THEN 1 ELSE 0 END) AS denied_count,
    ROUND(100.0 * SUM(CASE WHEN decision_type = 'AUTO_APPROVED' THEN 1 ELSE 0 END) / 
          NULLIF(COUNT(*), 0), 2) AS auto_approval_rate,
    ROUND(AVG(total_turnaround_hours), 2) AS avg_turnaround_hours,
    ROUND(AVG(ai_confidence_score), 2) AS avg_ai_confidence,
    ROUND(100.0 * SUM(CASE WHEN was_appealed THEN 1 ELSE 0 END) / 
          NULLIF(COUNT(*), 0), 2) AS appeal_rate
FROM fact_pa_metrics
GROUP BY metric_date
ORDER BY metric_date DESC;

-- AI Performance Trends
CREATE VIEW v_ai_performance_trends AS
SELECT 
    evaluation_date,
    model_version,
    total_predictions,
    accuracy_rate,
    human_agreement_rate,
    overturn_rate,
    high_confidence_accuracy,
    concept_drift_detected
FROM ai_model_performance
ORDER BY evaluation_date DESC, model_version;

-- Payer Comparison
CREATE VIEW v_payer_comparison AS
SELECT 
    payer_name,
    SUM(total_pa_received) AS total_volume,
    ROUND(AVG(avg_turnaround_hours), 2) AS avg_turnaround,
    ROUND(AVG(sla_compliance_rate), 2) AS sla_compliance,
    ROUND(AVG(api_success_rate), 2) AS integration_health,
    SUM(estimated_total_cost) AS total_estimated_cost
FROM payer_analytics
WHERE period_start >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY payer_name
ORDER BY total_volume DESC;

-- ================================================================
-- PREDICTIVE ANALYTICS TABLES
-- ================================================================

-- ML Model Predictions (for forecasting)
CREATE TABLE ml_predictions (
    prediction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    prediction_type VARCHAR(50), -- VOLUME_FORECAST, TURNAROUND_PREDICTION, DENIAL_RISK
    prediction_date DATE NOT NULL,
    for_date DATE NOT NULL, -- Date being predicted
    
    -- Prediction Values
    predicted_value DECIMAL(12,2),
    confidence_interval_lower DECIMAL(12,2),
    confidence_interval_upper DECIMAL(12,2),
    prediction_confidence DECIMAL(5,2),
    
    -- Model Info
    model_name VARCHAR(100),
    model_version VARCHAR(50),
    
    -- Actual Value (filled in after the fact)
    actual_value DECIMAL(12,2),
    prediction_error DECIMAL(12,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ml_pred_type ON ml_predictions(prediction_type);
CREATE INDEX idx_ml_pred_for_date ON ml_predictions(for_date);

-- ================================================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- ================================================================

-- Weekly Summary (Refresh every Sunday)
CREATE MATERIALIZED VIEW mv_weekly_summary AS
SELECT 
    DATE_TRUNC('week', metric_date)::DATE AS week_start,
    COUNT(DISTINCT pa_hash) AS total_pas,
    ROUND(AVG(ai_confidence_score), 2) AS avg_ai_score,
    ROUND(AVG(total_turnaround_hours), 2) AS avg_turnaround,
    ROUND(100.0 * SUM(CASE WHEN decision_type = 'AUTO_APPROVED' THEN 1 ELSE 0 END) / 
          NULLIF(COUNT(*), 0), 2) AS auto_approval_rate,
    ROUND(100.0 * SUM(CASE WHEN was_appealed THEN 1 ELSE 0 END) / 
          NULLIF(COUNT(*), 0), 2) AS appeal_rate
FROM fact_pa_metrics
GROUP BY DATE_TRUNC('week', metric_date)
ORDER BY week_start DESC;

CREATE UNIQUE INDEX idx_mv_weekly ON mv_weekly_summary(week_start);

-- Monthly Payer Metrics
CREATE MATERIALIZED VIEW mv_monthly_payer_metrics AS
SELECT 
    DATE_TRUNC('month', metric_date)::DATE AS month_start,
    payer_name,
    COUNT(*) AS volume,
    ROUND(AVG(total_turnaround_hours), 2) AS avg_turnaround,
    ROUND(100.0 * SUM(CASE WHEN final_decision = 'APPROVED' THEN 1 ELSE 0 END) / 
          NULLIF(COUNT(*), 0), 2) AS approval_rate
FROM fact_pa_metrics
GROUP BY DATE_TRUNC('month', metric_date), payer_name
ORDER BY month_start DESC, volume DESC;

CREATE INDEX idx_mv_monthly_payer ON mv_monthly_payer_metrics(month_start, payer_name);

-- ================================================================
-- ETL METADATA TRACKING
-- ================================================================

CREATE TABLE etl_job_log (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50), -- EXTRACT, TRANSFORM, LOAD, AGGREGATE
    
    source_table VARCHAR(100),
    target_table VARCHAR(100),
    
    -- Execution
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20), -- RUNNING, SUCCESS, FAILED
    
    -- Metrics
    rows_processed INTEGER,
    rows_inserted INTEGER,
    rows_updated INTEGER,
    rows_failed INTEGER,
    
    -- Errors
    error_message TEXT,
    error_details JSONB,
    
    -- Performance
    execution_time_seconds INTEGER
);

CREATE INDEX idx_etl_job_name ON etl_job_log(job_name);
CREATE INDEX idx_etl_started ON etl_job_log(started_at DESC);

-- ================================================================
-- SAMPLE AGGREGATION QUERIES
-- ================================================================

-- Function to calculate daily metrics from clinical DB
CREATE OR REPLACE FUNCTION refresh_daily_pa_metrics(target_date DATE)
RETURNS INTEGER AS $$
DECLARE
    rows_inserted INTEGER;
BEGIN
    INSERT INTO fact_pa_metrics (
        metric_id,
        date_key,
        metric_date,
        day_of_week,
        week_of_year,
        month,
        quarter,
        year,
        pa_hash,
        payer_id,
        payer_name,
        provider_specialty,
        urgency_level,
        ai_confidence_score,
        ai_recommendation,
        final_decision,
        decision_type,
        total_turnaround_hours,
        was_appealed
    )
    SELECT 
        nextval('fact_pa_metrics_metric_id_seq'),
        TO_CHAR(target_date, 'YYYYMMDD')::INTEGER,
        target_date,
        EXTRACT(DOW FROM target_date)::INTEGER,
        EXTRACT(WEEK FROM target_date)::INTEGER,
        EXTRACT(MONTH FROM target_date)::INTEGER,
        EXTRACT(QUARTER FROM target_date)::INTEGER,
        EXTRACT(YEAR FROM target_date)::INTEGER,
        ENCODE(SHA256(pa_number::BYTEA), 'hex'),
        pr.payer_id,
        p.payer_name,
        pr.requesting_provider_specialty,
        pr.urgency_level,
        pr.ai_confidence_score,
        pr.ai_recommendation,
        pr.status,
        pr.decision_type,
        pr.submission_to_decision_hours,
        CASE WHEN pr.appeal_id IS NOT NULL THEN TRUE ELSE FALSE END
    FROM clinical_db.pa_requests pr
    JOIN clinical_db.payers p ON pr.payer_id = p.payer_id
    WHERE DATE(pr.submitted_at) = target_date
      AND pr.deleted_at IS NULL;
    
    GET DIAGNOSTICS rows_inserted = ROW_COUNT;
    RETURN rows_inserted;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- GRANT PERMISSIONS
-- ================================================================

CREATE ROLE analytics_readonly;
CREATE ROLE analytics_readwrite;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_readonly;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO analytics_readwrite;

-- ================================================================
-- END OF ANALYTICS DATABASE SCHEMA
-- ================================================================
