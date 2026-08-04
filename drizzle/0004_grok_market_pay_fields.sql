-- Grok migration: market-first pay fields + historical change tracking
ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "previous_submission_count" integer;
ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "submission_count_change" integer;
ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "previous_status" varchar(100);
ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "status_change" varchar(100);

ALTER TABLE "requisition_analysis_results" ADD COLUMN IF NOT EXISTS "market_pay_floor" numeric(10, 2);
ALTER TABLE "requisition_analysis_results" ADD COLUMN IF NOT EXISTS "bill_rate_supports_market_pay" boolean;

ALTER TABLE "requisition_snapshots" ADD COLUMN IF NOT EXISTS "market_pay_floor" numeric(10, 2);
ALTER TABLE "requisition_snapshots" ADD COLUMN IF NOT EXISTS "bill_rate_supports_market_pay" boolean;
