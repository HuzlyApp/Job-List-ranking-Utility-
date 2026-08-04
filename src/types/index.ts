import { z } from "zod";
import { parseHourlyRate } from "@/lib/pay-normalization";

// =============================================================================
// Extraction Schemas (Operation 1: Extract and Normalize)
// =============================================================================

export const ExtractedRequisitionOccurrenceSchema = z.object({
  source_record_key: z.string().min(1),
  source_file_ids: z.array(z.string().min(1)).min(1),

  status: z.string().nullable(),
  requisition_id: z.string().nullable(),
  customer: z.string().nullable(),
  job_title: z.string().nullable(),
  submissions: z.number().int().nonnegative().nullable(),
  c2c_bill_rate: z.number().nonnegative().nullable(),
  location: z.string().nullable(),
  start_date: z.string().nullable(),
  duration: z.string().nullable(),
  number_of_positions: z.number().int().nonnegative().nullable(),
  active_submissions: z.number().int().nonnegative().nullable(),
  released_date: z.string().nullable(),
  position_type: z.string().nullable(),
  remote_or_onsite: z.enum(["Remote", "Hybrid", "On-site", "Unknown"]).nullable(),

  source_confidence: z.enum(["High", "Medium", "Low"]),
  data_quality_notes: z.array(z.string()).default([]),
});

export type ExtractedRequisitionOccurrence = z.infer<typeof ExtractedRequisitionOccurrenceSchema>;

export const ClaudeExtractionSchema = z.object({
  processing_summary: z.object({
    files_processed: z.number().int().nonnegative(),
    screenshots_processed: z.number().int().nonnegative(),
    spreadsheet_rows_processed: z.number().int().nonnegative(),
    visible_rows_detected: z.number().int().nonnegative(),
    potential_duplicates_detected: z.number().int().nonnegative(),
    uncertain_record_count: z.number().int().nonnegative(),
  }),
  jobs: z.array(ExtractedRequisitionOccurrenceSchema),
});

export type ClaudeExtractionOutput = z.infer<typeof ClaudeExtractionSchema>;

// =============================================================================
// Pay and Fillability Schemas (Operation 2: Pay and Fillability Analysis)
// =============================================================================

/** Accepts numbers, numeric strings, currency strings; rejects zero/negative → null */
const HourlyRateSchema = z
  .unknown()
  .transform((val) => parseHourlyRate(val))
  .pipe(z.number().positive().nullable());

export const ClaudePayAnalysisItemSchema = z.object({
  requisition_id: z.string().min(1),

  // Preferred field names (pay-range first)
  recommended_pay_min: HourlyRateSchema.optional(),
  recommended_pay_max: HourlyRateSchema.optional(),
  // Canonical / Grok field names
  recommended_w2_pay_min: HourlyRateSchema.optional(),
  recommended_w2_pay_max: HourlyRateSchema.optional(),

  market_pay_floor: HourlyRateSchema.optional(),
  market_pay_confidence: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  pay_recommendation_reason: z.string().min(1).nullable().optional(),
  bill_rate_supports_market_pay: z.boolean().nullable().optional(),

  pay_range_confidence: z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
  pay_range_reason: z.string().min(1).optional(),
  pay_estimate_reason: z.string().min(1).optional(),

  pay_range_fit: z
    .enum([
      "Strong Fit",
      "Workable",
      "Tight",
      "Below Market",
      "Requires Review",
      "Unavailable",
    ])
    .optional(),

  market_rate_warning: z.string().nullable().optional(),

  fillability_score: z.number().min(0).max(100),
  fillability_label: z.enum([
    "Easy",
    "Moderate",
    "Difficult",
    "Very Difficult",
    "Extremely Difficult",
  ]),
  fillability_reason: z.string().min(1),

  suggested_risk_classification: z.enum([
    "standard",
    "higher_risk_technical",
    "healthcare",
    "manual_review",
  ]),
}).transform((item) => {
  const recommended_w2_pay_min =
    item.recommended_pay_min ?? item.recommended_w2_pay_min ?? null;
  const recommended_w2_pay_max =
    item.recommended_pay_max ?? item.recommended_w2_pay_max ?? null;
  const pay_estimate_reason =
    item.pay_recommendation_reason ||
    item.pay_range_reason ||
    item.pay_estimate_reason ||
    "Pay range estimated from role and market context";
  const market_pay_confidence =
    item.market_pay_confidence || item.pay_range_confidence || "Medium";

  return {
    requisition_id: item.requisition_id,
    recommended_w2_pay_min,
    recommended_w2_pay_max,
    recommended_pay_min: recommended_w2_pay_min,
    recommended_pay_max: recommended_w2_pay_max,
    market_pay_floor: item.market_pay_floor ?? null,
    market_pay_confidence,
    pay_recommendation_reason: pay_estimate_reason,
    bill_rate_supports_market_pay: item.bill_rate_supports_market_pay ?? null,
    pay_range_confidence: market_pay_confidence,
    pay_estimate_reason,
    pay_range_reason: pay_estimate_reason,
    pay_range_fit: item.pay_range_fit,
    market_rate_warning: item.market_rate_warning ?? null,
    fillability_score: item.fillability_score,
    fillability_label: item.fillability_label,
    fillability_reason: item.fillability_reason,
    suggested_risk_classification: item.suggested_risk_classification,
  };
});

export type ClaudePayAnalysisItem = z.infer<typeof ClaudePayAnalysisItemSchema>;

export const ClaudePayAnalysisSchema = z.object({
  jobs: z.array(ClaudePayAnalysisItemSchema),
});

export type ClaudePayAnalysisOutput = z.infer<typeof ClaudePayAnalysisSchema>;

/** Provider-neutral aliases (Claude* names kept for backward compatibility) */
export const GrokExtractionSchema = ClaudeExtractionSchema;
export type GrokExtractionOutput = ClaudeExtractionOutput;
export const GrokPayAnalysisSchema = ClaudePayAnalysisSchema;
export type GrokPayAnalysisOutput = ClaudePayAnalysisOutput;

// =============================================================================
// Legacy combined schemas (for backward compatibility during refactor)
// =============================================================================

export const ExtractedRequisitionSchema = z.object({
  source_record_key: z.string(),
  status: z.string().nullable(),
  requisition_id: z.string().nullable(),
  customer: z.string().nullable(),
  job_title: z.string().nullable(),
  submissions: z.number().nullable(),
  c2c_bill_rate: z.number().nullable(),
  location: z.string().nullable(),
  start_date: z.string().nullable(),
  duration: z.string().nullable(),
  number_of_positions: z.number().nullable(),
  active_submissions: z.number().nullable(),
  released_date: z.string().nullable(),
  position_type: z.string().nullable(),
  remote_or_onsite: z.enum(["Remote", "Hybrid", "On-site", "Unknown"]).nullable(),
  source_confidence: z.enum(["High", "Medium", "Low"]),
  data_quality_notes: z.array(z.string()).default([]),
  /** Original bill-rate text from the source file (e.g. "$70.00") */
  source_c2c_bill_rate: z.string().nullable().optional(),
  /** Decimal-safe normalized bill rate string (e.g. "70.00") */
  c2c_bill_rate_normalized: z.string().nullable().optional(),
  source_start_date: z.string().nullable().optional(),
  source_released_date: z.string().nullable().optional(),
  source_duration: z.string().nullable().optional(),
  normalized_duration_weeks: z.number().nullable().optional(),
});

export type ExtractedRequisition = z.infer<typeof ExtractedRequisitionSchema>;

export const PayAnalysisResultSchema = z.object({
  source_record_key: z.string(),
  recommended_w2_pay_min: z.number(),
  recommended_w2_pay_max: z.number(),
  fillability_score: z.number().min(0).max(100),
  fillability_label: z.enum(["Easy", "Moderate", "Difficult", "Very Difficult", "Extremely Difficult"]),
  pay_estimate_reason: z.string(),
  market_rate_warning: z.string().nullable(),
});

export type PayAnalysisResult = z.infer<typeof PayAnalysisResultSchema>;

// =============================================================================
// Financial Assumptions
// =============================================================================

export const FinancialAssumptionsSchema = z.object({
  ficaPercent: z.number().default(7.65),
  futaSutaHourly: z.number().default(0.45),
  standardWorkersCompHourly: z.number().default(0.30),
  highRiskWorkersCompHourly: z.number().default(0.60),
  healthcareWorkersCompHourly: z.number().nullable(),
  payrollProcessingHourly: z.number().default(0.25),
  complianceHourly: z.number().default(0.20),
  insuranceHourly: z.number().default(0.25),
  recruitingHourly: z.number().default(1.25),
  overheadHourly: z.number().default(0.75),
  benefitsHourly: z.number().default(0.00),
  ptoHourly: z.number().default(0.00),
  otherHourlyCosts: z.number().default(0.00),
});

export type FinancialAssumptions = z.infer<typeof FinancialAssumptionsSchema>;

// =============================================================================
// Scoring Weights
// =============================================================================

export const ScoringWeightsSchema = z.object({
  competitionWeight: z.number().default(30),
  profitabilityWeight: z.number().default(25),
  fillabilityWeight: z.number().default(20),
  billRateWeight: z.number().default(15),
  durationWeight: z.number().default(10),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

// =============================================================================
// MSP Program Configuration
// =============================================================================

export const MSPProgramConfigSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  platformName: z.string().optional(),
  vendorFeeType: z.enum(["percentage", "flat_hourly", "none"]).default("percentage"),
  vendorFeeValue: z.number().default(2.0),
  defaultWeeklyHours: z.number().default(40),
  currency: z.enum(["USD"]).default("USD"),
  isActive: z.boolean().default(true),
});

export type MSPProgramConfig = z.infer<typeof MSPProgramConfigSchema>;

// =============================================================================
// Column Aliases
// =============================================================================

export const COLUMN_ALIASES: Record<string, string[]> = {
  requisition_id: ["Req ID", "Requisition ID", "Req Number", "Requisition Number", "ID", "Req#"],
  customer: ["Customer", "Client", "Company", "Employer"],
  job_title: ["Job Title", "Title", "Position", "Role", "Job"],
  submissions: ["Subs", "Submissions", "Submission Count", "Total Submissions"],
  c2c_bill_rate: ["C2C Rate", "Bill Rate", "Rate", "C2C Bill Rate", "Pay Rate"],
  location: ["Location", "City", "Place", "Site"],
  start_date: ["Start Date", "Start", "Begin Date", "Start Date"],
  duration: ["Duration", "Length", "Term", "Period"],
  number_of_positions: ["Positions", "Pos", "Number of Positions", "Openings", "Qty"],
  active_submissions: ["Active", "Active Submissions", "Active Subs", "In Progress"],
  released_date: ["Released", "Released Date", "Posted Date", "Date Released"],
  position_type: ["Type", "Position Type", "Contract Type", "Employment Type"],
  status: ["Status", "State", "Req Status"],
};

// =============================================================================
// Duration conversions (weeks)
// =============================================================================

export const DURATION_CONVERSIONS: Record<string, number> = {
  "4 months": 17.3,
  "5 months": 21.7,
  "6 months": 26,
  "7 months": 30.3,
  "8 months": 34.7,
  "9 months": 39,
  "10 months": 43.3,
  "11 months": 47.7,
  "12 months": 52,
  "1 year": 52,
  "18 months": 78,
  "2 years": 104,
};

// =============================================================================
// Customer normalization aliases
// =============================================================================

export const CUSTOMER_ALIASES: Record<string, string> = {
  "LTI": "LTI Mindtree",
  "Fidelity": "Fidelity Investments",
  "UHG": "UnitedHealth Group",
  "Optum": "UnitedHealth Group / Optum",
  "Wells": "Wells Fargo",
  "BofA": "Bank of America",
  "BoA": "Bank of America",
};
