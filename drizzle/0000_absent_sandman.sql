CREATE TYPE "public"."batch_status" AS ENUM('uploaded', 'validating', 'parsing', 'extracting', 'awaiting_review', 'reviewing', 'analyzing', 'calculating', 'persisting', 'completed', 'partially_completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pay_scenario" AS ENUM('minimum', 'midpoint', 'maximum', 'custom');--> statement-breakpoint
CREATE TYPE "public"."recommendation" AS ENUM('Recruit Immediately', 'High Priority', 'Good Opportunity', 'Candidate Driven', 'Only If Candidate Available', 'Skip or Monitor');--> statement-breakpoint
CREATE TYPE "public"."recruiting_status" AS ENUM('Not Reviewed', 'Reviewing', 'Approved to Work', 'Sourcing', 'Candidate Identified', 'Submitted', 'Interviewing', 'Filled', 'Closed', 'Skip', 'Monitor');--> statement-breakpoint
CREATE TYPE "public"."role_risk_classification" AS ENUM('Standard', 'Higher-Risk Technical', 'Healthcare', 'Manual Review');--> statement-breakpoint
CREATE TYPE "public"."source_confidence" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."work_arrangement" AS ENUM('Remote', 'Hybrid', 'On-site', 'Unknown');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"previous_state" jsonb,
	"new_state" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claude_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid,
	"operation" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_version" varchar(50),
	"request_status" varchar(50) NOT NULL,
	"validation_status" varchar(50),
	"repair_attempt_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"provider_request_id" varchar(255),
	"sanitized_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"alias" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_assumption_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"msp_program_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"fica_percent" numeric(5, 2) DEFAULT '7.65' NOT NULL,
	"futa_suta_hourly" numeric(6, 2) DEFAULT '0.45' NOT NULL,
	"standard_workers_comp_hourly" numeric(6, 2) DEFAULT '0.30' NOT NULL,
	"high_risk_workers_comp_hourly" numeric(6, 2) DEFAULT '0.60' NOT NULL,
	"healthcare_workers_comp_hourly" numeric(6, 2),
	"payroll_processing_hourly" numeric(6, 2) DEFAULT '0.25' NOT NULL,
	"compliance_hourly" numeric(6, 2) DEFAULT '0.20' NOT NULL,
	"insurance_hourly" numeric(6, 2) DEFAULT '0.25' NOT NULL,
	"recruiting_hourly" numeric(6, 2) DEFAULT '1.25' NOT NULL,
	"overhead_hourly" numeric(6, 2) DEFAULT '0.75' NOT NULL,
	"benefits_hourly" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"pto_hourly" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"other_hourly_costs" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msp_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"platform_name" varchar(255),
	"vendor_fee_type" varchar(50) DEFAULT 'percentage' NOT NULL,
	"vendor_fee_value" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"default_weekly_hours" integer DEFAULT 40 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_analysis_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"msp_program_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "batch_status" DEFAULT 'uploaded' NOT NULL,
	"claude_model" varchar(100),
	"prompt_version" varchar(50),
	"source_hash" varchar(64),
	"files_count" integer DEFAULT 0 NOT NULL,
	"represents_complete_portal_view" boolean DEFAULT false NOT NULL,
	"error_code" varchar(50),
	"sanitized_error_message" text,
	"processing_summary" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"recommended_pay_min" numeric(10, 2),
	"recommended_pay_max" numeric(10, 2),
	"pay_midpoint" numeric(10, 2),
	"selected_pay_rate" numeric(10, 2),
	"pay_scenario" "pay_scenario" DEFAULT 'midpoint',
	"pay_estimate_reason" text,
	"market_rate_warning" text,
	"role_risk_classification" "role_risk_classification" DEFAULT 'Standard',
	"effective_vendor_rate" numeric(10, 2),
	"estimated_w2_cost" numeric(10, 2),
	"gross_spread_per_hour" numeric(10, 2),
	"estimated_profit_per_hour" numeric(10, 2),
	"net_margin_percent" numeric(6, 2),
	"weekly_profit" numeric(12, 2),
	"assignment_profit" numeric(12, 2),
	"competition_score" integer,
	"profitability_score" integer,
	"fillability_score" integer,
	"fillability_label" varchar(50),
	"bill_rate_score" integer,
	"duration_score" integer,
	"opportunity_score" integer,
	"rank" integer,
	"calculated_recommendation" "recommendation",
	"final_recommendation" "recommendation",
	"requires_manual_review" boolean DEFAULT false NOT NULL,
	"claude_model" varchar(100),
	"prompt_version" varchar(50),
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_analysis_results_requisition_id_unique" UNIQUE("requisition_id")
);
--> statement-breakpoint
CREATE TABLE "requisition_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_values" jsonb NOT NULL,
	"recommended_pay_min" numeric(10, 2),
	"recommended_pay_max" numeric(10, 2),
	"pay_midpoint" numeric(10, 2),
	"selected_pay_rate" numeric(10, 2),
	"pay_scenario" "pay_scenario" DEFAULT 'midpoint',
	"pay_estimate_reason" text,
	"market_rate_warning" text,
	"role_risk_classification" "role_risk_classification" DEFAULT 'Standard',
	"effective_vendor_rate" numeric(10, 2),
	"estimated_w2_cost" numeric(10, 2),
	"gross_spread_per_hour" numeric(10, 2),
	"estimated_profit_per_hour" numeric(10, 2),
	"net_margin_percent" numeric(6, 2),
	"weekly_profit" numeric(12, 2),
	"assignment_profit" numeric(12, 2),
	"competition_score" integer,
	"profitability_score" integer,
	"fillability_score" integer,
	"fillability_label" varchar(50),
	"bill_rate_score" integer,
	"duration_score" integer,
	"opportunity_score" integer,
	"rank" integer,
	"calculated_recommendation" "recommendation",
	"assumption_set_id" uuid,
	"scoring_weights_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"original_filename" varchar(500) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"checksum" varchar(64),
	"page_or_sheet_count" integer,
	"processing_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_source_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"source_record_key" varchar(255) NOT NULL,
	"sheet_name" varchar(255),
	"row_number" integer,
	"screenshot_index" integer,
	"extracted_json" jsonb NOT NULL,
	"confirmed_json" jsonb,
	"source_confidence" "source_confidence" DEFAULT 'Medium' NOT NULL,
	"data_quality_notes" jsonb DEFAULT '[]'::jsonb,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"msp_program_id" uuid NOT NULL,
	"requisition_id" varchar(100) NOT NULL,
	"status" varchar(100),
	"source_customer_name" varchar(255),
	"normalized_customer_name" varchar(255),
	"job_title" varchar(500),
	"location" varchar(500),
	"start_date" timestamp with time zone,
	"source_duration" varchar(100),
	"normalized_duration_weeks" numeric(6, 2),
	"number_of_positions" integer,
	"submission_count" integer,
	"active_submission_count" integer,
	"displayed_vendor_rate" numeric(10, 2),
	"released_date" timestamp with time zone,
	"position_type" varchar(100),
	"remote_or_onsite" "work_arrangement" DEFAULT 'Unknown',
	"source_confidence" "source_confidence" DEFAULT 'Medium' NOT NULL,
	"data_quality_notes" jsonb DEFAULT '[]'::jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_analyzed_at" timestamp with time zone,
	"is_new_today" boolean DEFAULT true NOT NULL,
	"is_no_longer_visible" boolean DEFAULT false NOT NULL,
	"recruiter_owner_id" uuid,
	"recruiting_status" "recruiting_status" DEFAULT 'Not Reviewed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"msp_program_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"competition_weight" integer DEFAULT 30 NOT NULL,
	"profitability_weight" integer DEFAULT 25 NOT NULL,
	"fillability_weight" integer DEFAULT 20 NOT NULL,
	"bill_rate_weight" integer DEFAULT 15 NOT NULL,
	"duration_weight" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"role" varchar(50) DEFAULT 'recruiter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_request_logs" ADD CONSTRAINT "claude_request_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_request_logs" ADD CONSTRAINT "claude_request_logs_batch_id_requisition_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."requisition_analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_aliases" ADD CONSTRAINT "customer_aliases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_assumption_sets" ADD CONSTRAINT "financial_assumption_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_assumption_sets" ADD CONSTRAINT "financial_assumption_sets_msp_program_id_msp_programs_id_fk" FOREIGN KEY ("msp_program_id") REFERENCES "public"."msp_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_assumption_sets" ADD CONSTRAINT "financial_assumption_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "msp_programs" ADD CONSTRAINT "msp_programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_batches" ADD CONSTRAINT "requisition_analysis_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_batches" ADD CONSTRAINT "requisition_analysis_batches_msp_program_id_msp_programs_id_fk" FOREIGN KEY ("msp_program_id") REFERENCES "public"."msp_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_batches" ADD CONSTRAINT "requisition_analysis_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_results" ADD CONSTRAINT "requisition_analysis_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_results" ADD CONSTRAINT "requisition_analysis_results_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_overrides" ADD CONSTRAINT "requisition_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_overrides" ADD CONSTRAINT "requisition_overrides_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_overrides" ADD CONSTRAINT "requisition_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_snapshots" ADD CONSTRAINT "requisition_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_snapshots" ADD CONSTRAINT "requisition_snapshots_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_snapshots" ADD CONSTRAINT "requisition_snapshots_batch_id_requisition_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."requisition_analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_snapshots" ADD CONSTRAINT "requisition_snapshots_assumption_set_id_financial_assumption_sets_id_fk" FOREIGN KEY ("assumption_set_id") REFERENCES "public"."financial_assumption_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_snapshots" ADD CONSTRAINT "requisition_snapshots_scoring_weights_id_scoring_weights_id_fk" FOREIGN KEY ("scoring_weights_id") REFERENCES "public"."scoring_weights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_files" ADD CONSTRAINT "requisition_source_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_files" ADD CONSTRAINT "requisition_source_files_batch_id_requisition_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."requisition_analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_rows" ADD CONSTRAINT "requisition_source_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_rows" ADD CONSTRAINT "requisition_source_rows_batch_id_requisition_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."requisition_analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_rows" ADD CONSTRAINT "requisition_source_rows_source_file_id_requisition_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."requisition_source_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_source_rows" ADD CONSTRAINT "requisition_source_rows_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_msp_program_id_msp_programs_id_fk" FOREIGN KEY ("msp_program_id") REFERENCES "public"."msp_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_recruiter_owner_id_users_id_fk" FOREIGN KEY ("recruiter_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_weights" ADD CONSTRAINT "scoring_weights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_weights" ADD CONSTRAINT "scoring_weights_msp_program_id_msp_programs_id_fk" FOREIGN KEY ("msp_program_id") REFERENCES "public"."msp_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_weights" ADD CONSTRAINT "scoring_weights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "claude_logs_tenant_idx" ON "claude_request_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "claude_logs_batch_idx" ON "claude_request_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "claude_logs_created_at_idx" ON "claude_request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "aliases_tenant_idx" ON "customer_aliases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "aliases_alias_idx" ON "customer_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "assumption_sets_tenant_idx" ON "financial_assumption_sets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "msp_programs_tenant_idx" ON "msp_programs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "batches_tenant_idx" ON "requisition_analysis_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "requisition_analysis_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "results_requisition_idx" ON "requisition_analysis_results" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "results_opportunity_score_idx" ON "requisition_analysis_results" USING btree ("opportunity_score");--> statement-breakpoint
CREATE INDEX "results_rank_idx" ON "requisition_analysis_results" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "results_final_recommendation_idx" ON "requisition_analysis_results" USING btree ("final_recommendation");--> statement-breakpoint
CREATE INDEX "overrides_requisition_idx" ON "requisition_overrides" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "snapshots_requisition_idx" ON "requisition_snapshots" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "snapshots_batch_idx" ON "requisition_snapshots" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "snapshots_created_at_idx" ON "requisition_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "source_files_batch_idx" ON "requisition_source_files" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "source_files_tenant_idx" ON "requisition_source_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "source_rows_batch_idx" ON "requisition_source_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "source_rows_file_idx" ON "requisition_source_rows" USING btree ("source_file_id");--> statement-breakpoint
CREATE INDEX "source_rows_record_key_idx" ON "requisition_source_rows" USING btree ("source_record_key");--> statement-breakpoint
CREATE INDEX "requisitions_tenant_idx" ON "requisitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "requisitions_program_idx" ON "requisitions" USING btree ("msp_program_id");--> statement-breakpoint
CREATE INDEX "requisitions_req_id_idx" ON "requisitions" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisitions_customer_idx" ON "requisitions" USING btree ("normalized_customer_name");--> statement-breakpoint
CREATE INDEX "requisitions_last_seen_idx" ON "requisitions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "requisitions_recruiter_idx" ON "requisitions" USING btree ("recruiter_owner_id");--> statement-breakpoint
CREATE INDEX "requisitions_is_new_idx" ON "requisitions" USING btree ("is_new_today");--> statement-breakpoint
CREATE INDEX "requisitions_is_no_longer_visible_idx" ON "requisitions" USING btree ("is_no_longer_visible");--> statement-breakpoint
CREATE UNIQUE INDEX "requisitions_unique_idx" ON "requisitions" USING btree ("tenant_id","msp_program_id","requisition_id");--> statement-breakpoint
CREATE INDEX "scoring_weights_tenant_idx" ON "scoring_weights" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scoring_weights_program_idx" ON "scoring_weights" USING btree ("msp_program_id");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");