-- Check constraints and composite indexes for MSP requisition domain.
-- Non-destructive: only ADD CONSTRAINT / CREATE INDEX IF NOT EXISTS.

ALTER TABLE "msp_programs"
  ADD CONSTRAINT "msp_programs_weekly_hours_positive"
  CHECK ("default_weekly_hours" > 0);

ALTER TABLE "msp_programs"
  ADD CONSTRAINT "msp_programs_vendor_fee_type_valid"
  CHECK ("vendor_fee_type" IN ('percentage', 'flat_hourly', 'none'));

ALTER TABLE "msp_programs"
  ADD CONSTRAINT "msp_programs_vendor_fee_range"
  CHECK (
    ("vendor_fee_type" = 'none' AND "vendor_fee_value" = 0)
    OR ("vendor_fee_type" = 'percentage' AND "vendor_fee_value" >= 0 AND "vendor_fee_value" <= 100)
    OR ("vendor_fee_type" = 'flat_hourly' AND "vendor_fee_value" >= 0)
  );

ALTER TABLE "scoring_weights"
  ADD CONSTRAINT "scoring_weights_nonnegative"
  CHECK (
    "competition_weight" >= 0
    AND "profitability_weight" >= 0
    AND "fillability_weight" >= 0
    AND "bill_rate_weight" >= 0
    AND "duration_weight" >= 0
  );

ALTER TABLE "scoring_weights"
  ADD CONSTRAINT "scoring_weights_sum_100_when_active"
  CHECK (
    "is_active" = false
    OR (
      "competition_weight"
      + "profitability_weight"
      + "fillability_weight"
      + "bill_rate_weight"
      + "duration_weight"
    ) = 100
  );

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_submission_count_nonneg"
  CHECK ("submission_count" IS NULL OR "submission_count" >= 0);

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_active_submission_count_nonneg"
  CHECK ("active_submission_count" IS NULL OR "active_submission_count" >= 0);

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_positions_nonneg"
  CHECK ("number_of_positions" IS NULL OR "number_of_positions" >= 0);

ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_bill_rate_nonneg"
  CHECK ("displayed_vendor_rate" IS NULL OR "displayed_vendor_rate" >= 0);

ALTER TABLE "requisition_analysis_results"
  ADD CONSTRAINT "results_pay_nonneg"
  CHECK (
    ("recommended_pay_min" IS NULL OR "recommended_pay_min" >= 0)
    AND ("recommended_pay_max" IS NULL OR "recommended_pay_max" >= 0)
    AND ("pay_midpoint" IS NULL OR "pay_midpoint" >= 0)
    AND ("selected_pay_rate" IS NULL OR "selected_pay_rate" >= 0)
  );

ALTER TABLE "requisition_analysis_results"
  ADD CONSTRAINT "results_pay_max_gte_min"
  CHECK (
    "recommended_pay_min" IS NULL
    OR "recommended_pay_max" IS NULL
    OR "recommended_pay_max" >= "recommended_pay_min"
  );

ALTER TABLE "requisition_analysis_results"
  ADD CONSTRAINT "results_scores_range"
  CHECK (
    ("competition_score" IS NULL OR ("competition_score" BETWEEN 0 AND 100))
    AND ("profitability_score" IS NULL OR ("profitability_score" BETWEEN 0 AND 100))
    AND ("fillability_score" IS NULL OR ("fillability_score" BETWEEN 0 AND 100))
    AND ("bill_rate_score" IS NULL OR ("bill_rate_score" BETWEEN 0 AND 100))
    AND ("duration_score" IS NULL OR ("duration_score" BETWEEN 0 AND 100))
    AND ("opportunity_score" IS NULL OR ("opportunity_score" BETWEEN 0 AND 100))
  );

CREATE INDEX IF NOT EXISTS "results_tenant_program_opportunity_idx"
  ON "requisition_analysis_results" ("tenant_id", "opportunity_score" DESC);

CREATE INDEX IF NOT EXISTS "snapshots_requisition_created_desc_idx"
  ON "requisition_snapshots" ("requisition_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_desc_idx"
  ON "audit_logs" ("tenant_id", "created_at" DESC);
