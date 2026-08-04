-- Tighten pay constraints: zero is never a valid recommended pay.
-- Clear existing invalid zero-pay rows before adding stricter checks.

-- 1. Repair persisted zeros → NULL (do not invent replacement pay)
UPDATE requisition_analysis_results
SET
  recommended_pay_min = CASE
    WHEN recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0 THEN NULL
    ELSE recommended_pay_min
  END,
  recommended_pay_max = CASE
    WHEN recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0 THEN NULL
    ELSE recommended_pay_max
  END,
  pay_midpoint = CASE
    WHEN pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0 THEN NULL
    ELSE pay_midpoint
  END,
  selected_pay_rate = CASE
    WHEN selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0 THEN NULL
    ELSE selected_pay_rate
  END,
  market_pay_floor = CASE
    WHEN market_pay_floor IS NOT NULL AND market_pay_floor::numeric <= 0 THEN NULL
    ELSE market_pay_floor
  END,
  estimated_w2_cost = NULL,
  gross_spread_per_hour = NULL,
  estimated_profit_per_hour = NULL,
  net_margin_percent = NULL,
  weekly_profit = NULL,
  assignment_profit = NULL,
  profitability_score = NULL,
  pay_range_fit = 'Requires Review',
  requires_manual_review = true,
  pay_estimate_reason = COALESCE(pay_estimate_reason, '') ||
    ' [Incomplete - pay recommendation unavailable; zero pay repaired to null]',
  updated_at = NOW()
WHERE
  (recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0)
  OR (recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0)
  OR (pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0)
  OR (selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0);

UPDATE requisition_snapshots
SET
  recommended_pay_min = CASE
    WHEN recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0 THEN NULL
    ELSE recommended_pay_min
  END,
  recommended_pay_max = CASE
    WHEN recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0 THEN NULL
    ELSE recommended_pay_max
  END,
  pay_midpoint = CASE
    WHEN pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0 THEN NULL
    ELSE pay_midpoint
  END,
  selected_pay_rate = CASE
    WHEN selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0 THEN NULL
    ELSE selected_pay_rate
  END
WHERE
  (recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0)
  OR (recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0)
  OR (pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0)
  OR (selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0);

-- 2. Drop old nonneg constraint that allowed zero; add positive-or-null checks
ALTER TABLE "requisition_analysis_results"
  DROP CONSTRAINT IF EXISTS "results_pay_nonneg";

ALTER TABLE "requisition_analysis_results"
  DROP CONSTRAINT IF EXISTS "results_pay_positive_or_null";

ALTER TABLE "requisition_analysis_results"
  ADD CONSTRAINT "results_pay_positive_or_null"
  CHECK (
    ("recommended_pay_min" IS NULL OR "recommended_pay_min" > 0)
    AND ("recommended_pay_max" IS NULL OR "recommended_pay_max" > 0)
    AND ("pay_midpoint" IS NULL OR "pay_midpoint" > 0)
    AND ("selected_pay_rate" IS NULL OR "selected_pay_rate" > 0)
  );

ALTER TABLE "requisition_analysis_results"
  DROP CONSTRAINT IF EXISTS "results_pay_max_gte_min";

ALTER TABLE "requisition_analysis_results"
  ADD CONSTRAINT "results_pay_max_gte_min"
  CHECK (
    "recommended_pay_min" IS NULL
    OR "recommended_pay_max" IS NULL
    OR "recommended_pay_max" >= "recommended_pay_min"
  );
