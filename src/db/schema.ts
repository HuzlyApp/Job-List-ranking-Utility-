import { pgTable, uuid, varchar, timestamp, integer, boolean, jsonb, decimal, text, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const batchStatusEnum = pgEnum("batch_status", [
  "uploaded",
  "validating",
  "parsing",
  "extracting",
  "awaiting_review",
  "reviewing",
  "analyzing",
  "calculating",
  "persisting",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);

export const sourceConfidenceEnum = pgEnum("source_confidence", ["High", "Medium", "Low"]);

export const workArrangementEnum = pgEnum("work_arrangement", ["Remote", "Hybrid", "On-site", "Unknown"]);

export const roleRiskEnum = pgEnum("role_risk_classification", [
  "Standard",
  "Higher-Risk Technical",
  "Healthcare",
  "Manual Review",
]);

export const recommendationEnum = pgEnum("recommendation", [
  "Recruit Immediately",
  "High Priority",
  "Good Opportunity",
  "Candidate Driven",
  "Only If Candidate Available",
  "Skip or Monitor",
]);

export const payScenarioEnum = pgEnum("pay_scenario", [
  "minimum",
  "midpoint",
  "maximum",
  "custom",
]);

export const recruitingStatusEnum = pgEnum("recruiting_status", [
  "Not Reviewed",
  "Reviewing",
  "Approved to Work",
  "Sourcing",
  "Candidate Identified",
  "Submitted",
  "Interviewing",
  "Filled",
  "Closed",
  "Skip",
  "Monitor",
]);

// Tenants table
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("recruiter"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("users_tenant_idx").on(table.tenantId)]);

// MSP Programs table
export const mspPrograms = pgTable("msp_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  platformName: varchar("platform_name", { length: 255 }),
  vendorFeeType: varchar("vendor_fee_type", { length: 50 }).notNull().default("percentage"),
  vendorFeeValue: decimal("vendor_fee_value", { precision: 5, scale: 2 }).notNull().default("2.00"),
  defaultWeeklyHours: integer("default_weekly_hours").notNull().default(40),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("msp_programs_tenant_idx").on(table.tenantId)]);

// Financial Assumption Sets table
export const financialAssumptionSets = pgTable("financial_assumption_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  mspProgramId: uuid("msp_program_id").references(() => mspPrograms.id).notNull(),
  version: integer("version").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  ficaPercent: decimal("fica_percent", { precision: 5, scale: 2 }).notNull().default("7.65"),
  futaSutaHourly: decimal("futa_suta_hourly", { precision: 6, scale: 2 }).notNull().default("0.45"),
  standardWorkersCompHourly: decimal("standard_workers_comp_hourly", { precision: 6, scale: 2 }).notNull().default("0.30"),
  highRiskWorkersCompHourly: decimal("high_risk_workers_comp_hourly", { precision: 6, scale: 2 }).notNull().default("0.60"),
  healthcareWorkersCompHourly: decimal("healthcare_workers_comp_hourly", { precision: 6, scale: 2 }),
  payrollProcessingHourly: decimal("payroll_processing_hourly", { precision: 6, scale: 2 }).notNull().default("0.25"),
  complianceHourly: decimal("compliance_hourly", { precision: 6, scale: 2 }).notNull().default("0.20"),
  insuranceHourly: decimal("insurance_hourly", { precision: 6, scale: 2 }).notNull().default("0.25"),
  recruitingHourly: decimal("recruiting_hourly", { precision: 6, scale: 2 }).notNull().default("1.25"),
  overheadHourly: decimal("overhead_hourly", { precision: 6, scale: 2 }).notNull().default("0.75"),
  benefitsHourly: decimal("benefits_hourly", { precision: 6, scale: 2 }).notNull().default("0.00"),
  ptoHourly: decimal("pto_hourly", { precision: 6, scale: 2 }).notNull().default("0.00"),
  otherHourlyCosts: decimal("other_hourly_costs", { precision: 6, scale: 2 }).notNull().default("0.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("assumption_sets_tenant_idx").on(table.tenantId)]);

// Scoring Weights table (opportunity score config — repo naming)
export const scoringWeights = pgTable("scoring_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  mspProgramId: uuid("msp_program_id").references(() => mspPrograms.id).notNull(),
  version: integer("version").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  competitionWeight: integer("competition_weight").notNull().default(30),
  profitabilityWeight: integer("profitability_weight").notNull().default(25),
  fillabilityWeight: integer("fillability_weight").notNull().default(20),
  billRateWeight: integer("bill_rate_weight").notNull().default(15),
  durationWeight: integer("duration_weight").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("scoring_weights_tenant_idx").on(table.tenantId),
  index("scoring_weights_program_idx").on(table.mspProgramId),
]);

// Requisition Analysis Batches table
export const requisitionAnalysisBatches = pgTable("requisition_analysis_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  mspProgramId: uuid("msp_program_id").references(() => mspPrograms.id).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  status: batchStatusEnum("status").notNull().default("uploaded"),
  claudeModel: varchar("claude_model", { length: 100 }),
  promptVersion: varchar("prompt_version", { length: 50 }),
  sourceHash: varchar("source_hash", { length: 64 }),
  filesCount: integer("files_count").notNull().default(0),
  representsCompletePortalView: boolean("represents_complete_portal_view").notNull().default(false),
  errorCode: varchar("error_code", { length: 50 }),
  sanitizedErrorMessage: text("sanitized_error_message"),
  processingSummary: jsonb("processing_summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("batches_tenant_idx").on(table.tenantId),
  index("batches_status_idx").on(table.status),
  index("batches_program_status_idx").on(table.tenantId, table.mspProgramId, table.status),
]);

// Requisition Source Files table
export const requisitionSourceFiles = pgTable("requisition_source_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  batchId: uuid("batch_id").references(() => requisitionAnalysisBatches.id).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  checksum: varchar("checksum", { length: 64 }),
  detectedEncoding: varchar("detected_encoding", { length: 50 }),
  pageOrSheetCount: integer("page_or_sheet_count"),
  processingStatus: varchar("processing_status", { length: 50 }).notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("source_files_batch_idx").on(table.batchId),
  index("source_files_tenant_idx").on(table.tenantId),
]);

// Requisition Source Rows table (extracted before deduplication)
export const requisitionSourceRows = pgTable("requisition_source_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  batchId: uuid("batch_id").references(() => requisitionAnalysisBatches.id).notNull(),
  sourceFileId: uuid("source_file_id").references(() => requisitionSourceFiles.id).notNull(),
  sourceRecordKey: varchar("source_record_key", { length: 255 }).notNull(),
  sheetName: varchar("sheet_name", { length: 255 }),
  rowNumber: integer("row_number"),
  screenshotIndex: integer("screenshot_index"),
  extractedJson: jsonb("extracted_json").notNull(),
  confirmedJson: jsonb("confirmed_json"),
  sourceConfidence: sourceConfidenceEnum("source_confidence").notNull().default("Medium"),
  dataQualityNotes: jsonb("data_quality_notes").default([]),
  excluded: boolean("excluded").notNull().default(false),
  exclusionReason: text("exclusion_reason"),
  manuallyEdited: boolean("manually_edited").notNull().default(false),
  editedBy: uuid("edited_by").references(() => users.id),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("source_rows_batch_idx").on(table.batchId),
  index("source_rows_file_idx").on(table.sourceFileId),
  index("source_rows_record_key_idx").on(table.sourceRecordKey),
]);

// Requisitions table (authoritative records after deduplication)
export const requisitions = pgTable("requisitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  mspProgramId: uuid("msp_program_id").references(() => mspPrograms.id).notNull(),
  requisitionId: varchar("requisition_id", { length: 100 }).notNull(),

  // Source data
  status: varchar("status", { length: 100 }),
  sourceCustomerName: varchar("source_customer_name", { length: 255 }),
  normalizedCustomerName: varchar("normalized_customer_name", { length: 255 }),
  jobTitle: varchar("job_title", { length: 500 }),
  location: varchar("location", { length: 500 }),
  startDate: timestamp("start_date", { withTimezone: true }),
  sourceDuration: varchar("source_duration", { length: 100 }),
  normalizedDurationWeeks: decimal("normalized_duration_weeks", { precision: 6, scale: 2 }),
  numberOfPositions: integer("number_of_positions"),
  submissionCount: integer("submission_count"),
  activeSubmissionCount: integer("active_submission_count"),
  displayedVendorRate: decimal("displayed_vendor_rate", { precision: 10, scale: 2 }),
  releasedDate: timestamp("released_date", { withTimezone: true }),
  positionType: varchar("position_type", { length: 100 }),
  remoteOrOnsite: workArrangementEnum("remote_or_onsite").default("Unknown"),
  sourceConfidence: sourceConfidenceEnum("source_confidence").notNull().default("Medium"),
  dataQualityNotes: jsonb("data_quality_notes").default([]),

  // Metadata
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastAnalyzedAt: timestamp("last_analyzed_at", { withTimezone: true }),
  isNewToday: boolean("is_new_today").notNull().default(true),
  isNoLongerVisible: boolean("is_no_longer_visible").notNull().default(false),

  // Workflow
  recruiterOwnerId: uuid("recruiter_owner_id").references(() => users.id),
  recruitingStatus: recruitingStatusEnum("recruiting_status").notNull().default("Not Reviewed"),
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("requisitions_tenant_idx").on(table.tenantId),
  index("requisitions_program_idx").on(table.mspProgramId),
  index("requisitions_req_id_idx").on(table.requisitionId),
  index("requisitions_customer_idx").on(table.normalizedCustomerName),
  index("requisitions_last_seen_idx").on(table.lastSeenAt),
  index("requisitions_first_seen_idx").on(table.firstSeenAt),
  index("requisitions_last_analyzed_idx").on(table.lastAnalyzedAt),
  index("requisitions_released_idx").on(table.releasedDate),
  index("requisitions_status_idx").on(table.status),
  index("requisitions_recruiter_idx").on(table.recruiterOwnerId),
  index("requisitions_is_new_idx").on(table.isNewToday),
  index("requisitions_is_no_longer_visible_idx").on(table.isNoLongerVisible),
  index("requisitions_tenant_program_status_idx").on(table.tenantId, table.mspProgramId, table.status),
  index("requisitions_recruiter_status_idx").on(table.tenantId, table.recruiterOwnerId, table.recruitingStatus),
  uniqueIndex("requisitions_unique_idx").on(table.tenantId, table.mspProgramId, table.requisitionId),
]);

// Requisition Snapshots table (historical state)
export const requisitionSnapshots = pgTable("requisition_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  requisitionId: uuid("requisition_id").references(() => requisitions.id).notNull(),
  batchId: uuid("batch_id").references(() => requisitionAnalysisBatches.id).notNull(),

  // Source values snapshot
  sourceValues: jsonb("source_values").notNull(),

  // Pay estimate snapshot
  recommendedPayMin: decimal("recommended_pay_min", { precision: 10, scale: 2 }),
  recommendedPayMax: decimal("recommended_pay_max", { precision: 10, scale: 2 }),
  payMidpoint: decimal("pay_midpoint", { precision: 10, scale: 2 }),
  selectedPayRate: decimal("selected_pay_rate", { precision: 10, scale: 2 }),
  payScenario: payScenarioEnum("pay_scenario").default("midpoint"),
  payEstimateReason: text("pay_estimate_reason"),
  marketRateWarning: text("market_rate_warning"),

  // Financial snapshot
  roleRiskClassification: roleRiskEnum("role_risk_classification").default("Standard"),
  effectiveVendorRate: decimal("effective_vendor_rate", { precision: 10, scale: 2 }),
  estimatedW2Cost: decimal("estimated_w2_cost", { precision: 10, scale: 2 }),
  grossSpreadPerHour: decimal("gross_spread_per_hour", { precision: 10, scale: 2 }),
  estimatedProfitPerHour: decimal("estimated_profit_per_hour", { precision: 10, scale: 2 }),
  netMarginPercent: decimal("net_margin_percent", { precision: 6, scale: 2 }),
  weeklyProfit: decimal("weekly_profit", { precision: 12, scale: 2 }),
  assignmentProfit: decimal("assignment_profit", { precision: 12, scale: 2 }),

  // Scores snapshot
  competitionScore: integer("competition_score"),
  profitabilityScore: integer("profitability_score"),
  fillabilityScore: integer("fillability_score"),
  fillabilityLabel: varchar("fillability_label", { length: 50 }),
  billRateScore: integer("bill_rate_score"),
  durationScore: integer("duration_score"),
  opportunityScore: integer("opportunity_score"),
  rank: integer("rank"),
  calculatedRecommendation: recommendationEnum("calculated_recommendation"),

  // Configuration snapshot
  assumptionSetId: uuid("assumption_set_id").references(() => financialAssumptionSets.id),
  scoringWeightsId: uuid("scoring_weights_id").references(() => scoringWeights.id),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("snapshots_requisition_idx").on(table.requisitionId),
  index("snapshots_batch_idx").on(table.batchId),
  index("snapshots_created_at_idx").on(table.createdAt),
]);

// Requisition Analysis Results table (current/latest)
export const requisitionAnalysisResults = pgTable("requisition_analysis_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  requisitionId: uuid("requisition_id").references(() => requisitions.id).notNull().unique(),
  batchId: uuid("batch_id").references(() => requisitionAnalysisBatches.id),

  // Pay estimates
  recommendedPayMin: decimal("recommended_pay_min", { precision: 10, scale: 2 }),
  recommendedPayMax: decimal("recommended_pay_max", { precision: 10, scale: 2 }),
  payMidpoint: decimal("pay_midpoint", { precision: 10, scale: 2 }),
  selectedPayRate: decimal("selected_pay_rate", { precision: 10, scale: 2 }),
  payScenario: payScenarioEnum("pay_scenario").default("midpoint"),
  payEstimateReason: text("pay_estimate_reason"),
  marketRateWarning: text("market_rate_warning"),

  // Financials
  roleRiskClassification: roleRiskEnum("role_risk_classification").default("Standard"),
  effectiveVendorRate: decimal("effective_vendor_rate", { precision: 10, scale: 2 }),
  estimatedW2Cost: decimal("estimated_w2_cost", { precision: 10, scale: 2 }),
  grossSpreadPerHour: decimal("gross_spread_per_hour", { precision: 10, scale: 2 }),
  estimatedProfitPerHour: decimal("estimated_profit_per_hour", { precision: 10, scale: 2 }),
  netMarginPercent: decimal("net_margin_percent", { precision: 6, scale: 2 }),
  weeklyProfit: decimal("weekly_profit", { precision: 12, scale: 2 }),
  assignmentProfit: decimal("assignment_profit", { precision: 12, scale: 2 }),

  // Scores
  competitionScore: integer("competition_score"),
  profitabilityScore: integer("profitability_score"),
  fillabilityScore: integer("fillability_score"),
  fillabilityLabel: varchar("fillability_label", { length: 50 }),
  billRateScore: integer("bill_rate_score"),
  durationScore: integer("duration_score"),
  opportunityScore: integer("opportunity_score"),
  rank: integer("rank"),

  // Recommendations
  calculatedRecommendation: recommendationEnum("calculated_recommendation"),
  finalRecommendation: recommendationEnum("final_recommendation"),
  requiresManualReview: boolean("requires_manual_review").notNull().default(false),

  // Metadata
  claudeModel: varchar("claude_model", { length: 100 }),
  promptVersion: varchar("prompt_version", { length: 50 }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("results_requisition_idx").on(table.requisitionId),
  index("results_batch_idx").on(table.batchId),
  index("results_opportunity_score_idx").on(table.opportunityScore),
  index("results_rank_idx").on(table.rank),
  index("results_final_recommendation_idx").on(table.finalRecommendation),
  index("results_tenant_opportunity_idx").on(table.tenantId, table.opportunityScore),
]);

// Requisition Overrides table
export const requisitionOverrides = pgTable("requisition_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  requisitionId: uuid("requisition_id").references(() => requisitions.id).notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("overrides_requisition_idx").on(table.requisitionId),
]);

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id"),
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_logs_tenant_idx").on(table.tenantId),
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  index("audit_logs_created_at_idx").on(table.createdAt),
]);

// Claude Request Logs table
export const claudeRequestLogs = pgTable("claude_request_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  batchId: uuid("batch_id").references(() => requisitionAnalysisBatches.id),
  operation: varchar("operation", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 50 }),
  requestStatus: varchar("request_status", { length: 50 }).notNull(),
  validationStatus: varchar("validation_status", { length: 50 }),
  repairAttemptCount: integer("repair_attempt_count").notNull().default(0),
  latencyMs: integer("latency_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  providerRequestId: varchar("provider_request_id", { length: 255 }),
  sanitizedError: text("sanitized_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("claude_logs_tenant_idx").on(table.tenantId),
  index("claude_logs_batch_idx").on(table.batchId),
  index("claude_logs_created_at_idx").on(table.createdAt),
]);

// Customer Aliases table
export const customerAliases = pgTable("customer_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  alias: varchar("alias", { length: 255 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("aliases_tenant_idx").on(table.tenantId),
  index("aliases_alias_idx").on(table.alias),
]);

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  mspPrograms: many(mspPrograms),
  batches: many(requisitionAnalysisBatches),
}));

export const mspProgramsRelations = relations(mspPrograms, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [mspPrograms.tenantId],
    references: [tenants.id],
  }),
  requisitions: many(requisitions),
  batches: many(requisitionAnalysisBatches),
  assumptionSets: many(financialAssumptionSets),
  scoringWeights: many(scoringWeights),
}));

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [requisitions.tenantId],
    references: [tenants.id],
  }),
  mspProgram: one(mspPrograms, {
    fields: [requisitions.mspProgramId],
    references: [mspPrograms.id],
  }),
  recruiterOwner: one(users, {
    fields: [requisitions.recruiterOwnerId],
    references: [users.id],
  }),
  snapshots: many(requisitionSnapshots),
  currentResult: one(requisitionAnalysisResults, {
    fields: [requisitions.id],
    references: [requisitionAnalysisResults.requisitionId],
  }),
  overrides: many(requisitionOverrides),
}));

export const batchesRelations = relations(requisitionAnalysisBatches, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [requisitionAnalysisBatches.tenantId],
    references: [tenants.id],
  }),
  mspProgram: one(mspPrograms, {
    fields: [requisitionAnalysisBatches.mspProgramId],
    references: [mspPrograms.id],
  }),
  createdByUser: one(users, {
    fields: [requisitionAnalysisBatches.createdBy],
    references: [users.id],
  }),
  sourceFiles: many(requisitionSourceFiles),
  sourceRows: many(requisitionSourceRows),
  snapshots: many(requisitionSnapshots),
}));
