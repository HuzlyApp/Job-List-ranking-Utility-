-- Pay-range fit / confidence and import duplicate tracking
DO $$ BEGIN
  CREATE TYPE pay_range_fit AS ENUM (
    'Strong Fit',
    'Workable',
    'Tight',
    'Below Market',
    'Requires Review',
    'Unavailable'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE duplicate_status AS ENUM (
    'New',
    'Duplicate in Current Import',
    'Already Exists',
    'Existing Record Updated',
    'Possible Duplicate',
    'Conflict Requires Review'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE requisition_analysis_results
  ADD COLUMN IF NOT EXISTS pay_range_confidence source_confidence,
  ADD COLUMN IF NOT EXISTS pay_range_fit pay_range_fit,
  ADD COLUMN IF NOT EXISTS pay_override_reason text;

ALTER TABLE requisition_snapshots
  ADD COLUMN IF NOT EXISTS pay_range_confidence source_confidence,
  ADD COLUMN IF NOT EXISTS pay_range_fit pay_range_fit,
  ADD COLUMN IF NOT EXISTS pay_override_reason text;

ALTER TABLE requisition_source_rows
  ADD COLUMN IF NOT EXISTS duplicate_status duplicate_status DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS matched_existing_requisition_id uuid REFERENCES requisitions(id),
  ADD COLUMN IF NOT EXISTS duplicate_match_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS results_pay_range_fit_idx
  ON requisition_analysis_results (pay_range_fit);

CREATE INDEX IF NOT EXISTS source_rows_duplicate_status_idx
  ON requisition_source_rows (duplicate_status);

-- Authoritative uniqueness already present as requisitions_unique_idx;
-- keep this no-op assert for operators reviewing migrations.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'requisitions_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX requisitions_unique_idx
      ON requisitions (tenant_id, msp_program_id, requisition_id);
  END IF;
END $$;
