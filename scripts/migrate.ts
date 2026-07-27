import { sql } from "drizzle-orm";
import { db } from "../src/db";

async function migrate() {
  console.log("Creating tables...");

  // Create enums first
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE batch_status AS ENUM ('uploaded', 'validating', 'extracting', 'awaiting_review', 'analyzing', 'calculating', 'completed', 'partially_completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE source_confidence AS ENUM ('High', 'Medium', 'Low');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE work_arrangement AS ENUM ('Remote', 'Hybrid', 'On-site', 'Unknown');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE role_risk_classification AS ENUM ('Standard', 'Higher-Risk Technical', 'Healthcare');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE recommendation AS ENUM ('Recruit Immediately', 'High Priority', 'Good Opportunity', 'Candidate Driven', 'Only If Candidate Available', 'Skip or Monitor');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE pay_scenario AS ENUM ('minimum', 'midpoint', 'maximum', 'custom');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE recruiting_status AS ENUM ('Not Reviewed', 'Reviewing', 'Approved to Work', 'Sourcing', 'Candidate Identified', 'Submitted', 'Interviewing', 'Filled', 'Closed', 'Skip', 'Monitor');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tenants table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(50) NOT NULL DEFAULT 'recruiter',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);`);

  // Create msp_programs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS msp_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      platform_name VARCHAR(255),
      vendor_fee_type VARCHAR(50) NOT NULL DEFAULT 'percentage',
      vendor_fee_value DECIMAL(5,2) NOT NULL DEFAULT 2.00,
      default_weekly_hours INTEGER NOT NULL DEFAULT 40,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS msp_programs_tenant_idx ON msp_programs(tenant_id);`);

  // Create financial_assumption_sets table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS financial_assumption_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      msp_program_id UUID NOT NULL REFERENCES msp_programs(id),
      version INTEGER NOT NULL,
      fica_percent DECIMAL(5,2) NOT NULL DEFAULT 7.65,
      futa_suta_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.45,
      standard_workers_comp_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.30,
      high_risk_workers_comp_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.60,
      healthcare_workers_comp_hourly DECIMAL(6,2),
      payroll_processing_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.25,
      compliance_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.20,
      insurance_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.25,
      recruiting_hourly DECIMAL(6,2) NOT NULL DEFAULT 1.25,
      overhead_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.75,
      benefits_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.00,
      pto_hourly DECIMAL(6,2) NOT NULL DEFAULT 0.00,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS assumption_sets_tenant_idx ON financial_assumption_sets(tenant_id);`);

  // Create scoring_weights table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scoring_weights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      msp_program_id UUID NOT NULL REFERENCES msp_programs(id),
      name VARCHAR(255) NOT NULL,
      competition_weight INTEGER NOT NULL DEFAULT 30,
      profitability_weight INTEGER NOT NULL DEFAULT 25,
      fillability_weight INTEGER NOT NULL DEFAULT 20,
      bill_rate_weight INTEGER NOT NULL DEFAULT 15,
      duration_weight INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS scoring_weights_tenant_idx ON scoring_weights(tenant_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS scoring_weights_program_idx ON scoring_weights(msp_program_id);`);

  // Create requisition_analysis_batches table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_analysis_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      msp_program_id UUID NOT NULL REFERENCES msp_programs(id),
      created_by UUID NOT NULL REFERENCES users(id),
      status batch_status NOT NULL DEFAULT 'uploaded',
      selected_ai_provider VARCHAR(50),
      selected_ai_model VARCHAR(100),
      prompt_version VARCHAR(50),
      files_count INTEGER NOT NULL DEFAULT 0,
      represents_complete_portal_view BOOLEAN NOT NULL DEFAULT FALSE,
      error_message TEXT,
      processing_summary JSONB,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS batches_tenant_idx ON requisition_analysis_batches(tenant_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS batches_status_idx ON requisition_analysis_batches(status);`);

  // Create requisition_source_files table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_source_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      batch_id UUID NOT NULL REFERENCES requisition_analysis_batches(id),
      original_filename VARCHAR(500) NOT NULL,
      storage_key VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER NOT NULL,
      checksum VARCHAR(64),
      page_or_sheet_count INTEGER,
      processing_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_files_batch_idx ON requisition_source_files(batch_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_files_tenant_idx ON requisition_source_files(tenant_id);`);

  // Create requisition_source_rows table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_source_rows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      batch_id UUID NOT NULL REFERENCES requisition_analysis_batches(id),
      source_file_id UUID NOT NULL REFERENCES requisition_source_files(id),
      temporary_source_key VARCHAR(255) NOT NULL,
      sheet_name VARCHAR(255),
      row_number INTEGER,
      screenshot_index INTEGER,
      extracted_json JSONB NOT NULL,
      source_confidence source_confidence NOT NULL DEFAULT 'Medium',
      data_quality_notes JSONB DEFAULT '[]',
      excluded BOOLEAN NOT NULL DEFAULT FALSE,
      exclusion_reason TEXT,
      manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_rows_batch_idx ON requisition_source_rows(batch_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_rows_file_idx ON requisition_source_rows(source_file_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_rows_temp_key_idx ON requisition_source_rows(temporary_source_key);`);

  // Create requisitions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      msp_program_id UUID NOT NULL REFERENCES msp_programs(id),
      requisition_id VARCHAR(100) NOT NULL,
      status VARCHAR(100),
      source_customer_name VARCHAR(255),
      normalized_customer_name VARCHAR(255),
      job_title VARCHAR(500),
      location VARCHAR(500),
      start_date TIMESTAMP WITH TIME ZONE,
      source_duration VARCHAR(100),
      normalized_duration_weeks DECIMAL(6,2),
      number_of_positions INTEGER,
      submission_count INTEGER,
      active_submission_count INTEGER,
      displayed_vendor_rate DECIMAL(10,2),
      released_date TIMESTAMP WITH TIME ZONE,
      position_type VARCHAR(100),
      remote_or_onsite work_arrangement DEFAULT 'Unknown',
      source_confidence source_confidence NOT NULL DEFAULT 'Medium',
      data_quality_notes JSONB DEFAULT '[]',
      first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      last_analyzed_at TIMESTAMP WITH TIME ZONE,
      is_new_today BOOLEAN NOT NULL DEFAULT TRUE,
      is_no_longer_visible BOOLEAN NOT NULL DEFAULT FALSE,
      recruiter_owner_id UUID REFERENCES users(id),
      recruiting_status recruiting_status NOT NULL DEFAULT 'Not Reviewed',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS requisitions_tenant_idx ON requisitions(tenant_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS requisitions_program_idx ON requisitions(msp_program_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS requisitions_req_id_idx ON requisitions(requisition_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS requisitions_customer_idx ON requisitions(normalized_customer_name);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS requisitions_last_seen_idx ON requisitions(last_seen_at);`);

  // Create unique constraint
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS requisitions_unique_idx 
    ON requisitions(tenant_id, msp_program_id, requisition_id);
  `);

  // Create requisition_snapshots table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      requisition_id UUID NOT NULL REFERENCES requisitions(id),
      batch_id UUID NOT NULL REFERENCES requisition_analysis_batches(id),
      source_values JSONB NOT NULL,
      recommended_pay_min DECIMAL(10,2),
      recommended_pay_max DECIMAL(10,2),
      pay_midpoint DECIMAL(10,2),
      selected_pay_rate DECIMAL(10,2),
      pay_scenario pay_scenario DEFAULT 'midpoint',
      pay_estimate_reason TEXT,
      market_rate_warning TEXT,
      role_risk_classification role_risk_classification DEFAULT 'Standard',
      effective_vendor_rate DECIMAL(10,2),
      estimated_w2_cost DECIMAL(10,2),
      gross_spread_per_hour DECIMAL(10,2),
      estimated_profit_per_hour DECIMAL(10,2),
      net_margin_percent DECIMAL(6,2),
      weekly_profit DECIMAL(12,2),
      assignment_profit DECIMAL(12,2),
      competition_score INTEGER,
      profitability_score INTEGER,
      fillability_score INTEGER,
      fillability_label VARCHAR(50),
      bill_rate_score INTEGER,
      duration_score INTEGER,
      opportunity_score INTEGER,
      rank INTEGER,
      calculated_recommendation recommendation,
      assumption_set_id UUID REFERENCES financial_assumption_sets(id),
      scoring_weights_id UUID REFERENCES scoring_weights(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS snapshots_requisition_idx ON requisition_snapshots(requisition_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS snapshots_batch_idx ON requisition_snapshots(batch_id);`);

  // Create requisition_analysis_results table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_analysis_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      requisition_id UUID NOT NULL UNIQUE REFERENCES requisitions(id),
      recommended_pay_min DECIMAL(10,2),
      recommended_pay_max DECIMAL(10,2),
      pay_midpoint DECIMAL(10,2),
      selected_pay_rate DECIMAL(10,2),
      pay_scenario pay_scenario DEFAULT 'midpoint',
      pay_estimate_reason TEXT,
      market_rate_warning TEXT,
      role_risk_classification role_risk_classification DEFAULT 'Standard',
      effective_vendor_rate DECIMAL(10,2),
      estimated_w2_cost DECIMAL(10,2),
      gross_spread_per_hour DECIMAL(10,2),
      estimated_profit_per_hour DECIMAL(10,2),
      net_margin_percent DECIMAL(6,2),
      weekly_profit DECIMAL(12,2),
      assignment_profit DECIMAL(12,2),
      competition_score INTEGER,
      profitability_score INTEGER,
      fillability_score INTEGER,
      fillability_label VARCHAR(50),
      bill_rate_score INTEGER,
      duration_score INTEGER,
      opportunity_score INTEGER,
      rank INTEGER,
      calculated_recommendation recommendation,
      final_recommendation recommendation,
      requires_manual_review BOOLEAN NOT NULL DEFAULT FALSE,
      calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS results_requisition_idx ON requisition_analysis_results(requisition_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS results_opportunity_score_idx ON requisition_analysis_results(opportunity_score);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS results_rank_idx ON requisition_analysis_results(rank);`);

  // Create requisition_overrides table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS requisition_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      requisition_id UUID NOT NULL REFERENCES requisitions(id),
      field_name VARCHAR(100) NOT NULL,
      previous_value JSONB,
      new_value JSONB NOT NULL,
      reason TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS overrides_requisition_idx ON requisition_overrides(requisition_id);`);

  // Create audit_logs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      user_id UUID REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id UUID,
      previous_state JSONB,
      new_state JSONB,
      metadata JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs(tenant_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);`);

  // Create customer_aliases table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      alias VARCHAR(255) NOT NULL,
      normalized_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS aliases_tenant_idx ON customer_aliases(tenant_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS aliases_alias_idx ON customer_aliases(alias);`);

  console.log("Migration completed successfully!");
}

migrate().catch(console.error);
