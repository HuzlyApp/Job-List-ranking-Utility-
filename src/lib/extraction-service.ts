import { db } from "@/db";
import {
  requisitionAnalysisBatches,
  requisitionSourceFiles,
  requisitionSourceRows,
  requisitions,
  requisitionAnalysisResults,
  requisitionSnapshots,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { ExtractedRequisition, FinancialAssumptions, ScoringWeights } from "@/types";
import { createRequisitionIntelligenceService } from "@/lib/ai-providers";
import { parseSpreadsheet, parseCSV, validateFileType } from "@/lib/file-parsing";
import {
  calculateFinancials,
  calculateScores,
  calculateW2CostPerHour,
  parseDurationToWeeks,
  assignRanks,
  getRecommendationLabel,
  getFillabilityLabel,
} from "@/lib/financial-calculations";
import { CUSTOMER_ALIASES } from "@/types";

type RequisitionAnalysisBatch = typeof requisitionAnalysisBatches.$inferSelect;

export interface BatchCreationInput {
  tenantId: string;
  mspProgramId: string;
  createdBy: string;
  representsCompletePortalView: boolean;
}

export interface FileUploadInput {
  batchId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  content: Buffer;
}

export interface ExtractionResult {
  batchId: string;
  extractedRows: ExtractedRequisition[];
  duplicatesDetected: number;
  uncertainCount: number;
}

/**
 * Create a new analysis batch
 */
export async function createBatch(input: BatchCreationInput): Promise<RequisitionAnalysisBatch> {
  const batch = {
    id: uuidv4(),
    tenantId: input.tenantId,
    mspProgramId: input.mspProgramId,
    createdBy: input.createdBy,
    status: "uploaded" as const,
    representsCompletePortalView: input.representsCompletePortalView,
    filesCount: 0,
  };

  const [result] = await db.insert(requisitionAnalysisBatches).values(batch).returning();
  return result;
}

/**
 * Upload and process a source file
 */
export async function uploadSourceFile(input: FileUploadInput): Promise<void> {
  // Validate file type
  if (!validateFileType(input.mimeType, input.filename)) {
    throw new Error(`Unsupported file type: ${input.mimeType}`);
  }

  const storageKey = `uploads/${input.tenantId}/${uuidv4()}_${input.filename}`;

  // Save file metadata
  await db.insert(requisitionSourceFiles).values({
    id: uuidv4(),
    tenantId: input.tenantId,
    batchId: input.batchId,
    originalFilename: input.filename,
    storageKey,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    processingStatus: "processing",
  });

  // Update batch file count
  await db
    .update(requisitionAnalysisBatches)
    .set({
      filesCount: sql`${requisitionAnalysisBatches.filesCount} + 1`,
      status: "validating",
    })
    .where(eq(requisitionAnalysisBatches.id, input.batchId));
}

/**
 * Process files and extract requisitions
 */
export async function processBatchExtraction(
  batchId: string,
  tenantId: string,
  aiProvider: string = "claude"
): Promise<ExtractionResult> {
  // Update status
  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "extracting" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  // Get source files
  const files = await db
    .select()
    .from(requisitionSourceFiles)
    .where(
      and(
        eq(requisitionSourceFiles.batchId, batchId),
        eq(requisitionSourceFiles.tenantId, tenantId)
      )
    );

  const extractedRows: ExtractedRequisition[] = [];
  let imageFiles = 0;
  let spreadsheetFiles = 0;
  let spreadsheetRows = 0;

  // Process each file
  for (const file of files) {
    if (file.mimeType.startsWith("image/")) {
      imageFiles++;
      // For images, we would normally send to AI for OCR
      // For now, skip image processing in this implementation
    } else if (
      file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimeType === "application/vnd.ms-excel"
    ) {
      spreadsheetFiles++;
      // Load file content (in real implementation, load from storage)
      // const content = await loadFileFromStorage(file.storageKey);
      // const parsed = parseSpreadsheet(content, file.originalFilename);
      // parsed.forEach(sheet => {
      //   spreadsheetRows += sheet.rows.length;
      //   extractedRows.push(...sheet.rows);
      // });
    } else if (file.mimeType === "text/csv" || file.mimeType === "application/csv") {
      spreadsheetFiles++;
      // const content = await loadFileFromStorage(file.storageKey);
      // const parsed = parseCSV(content, file.originalFilename);
      // spreadsheetRows += parsed.rows.length;
      // extractedRows.push(...parsed.rows);
    }
  }

  // Use AI for extraction if there are images
  if (imageFiles > 0) {
    const provider = createRequisitionIntelligenceService(
      aiProvider === "claude" ? undefined : aiProvider
    );

    // Storage loading is not implemented in this flow yet, so pass empty payloads for now.
    const result = await provider.extractRequisitions({
      images: [],
      spreadsheets: [],
      promptVersion: "v1.0",
    });
    extractedRows.push(...result.jobs);
  }

  // Save extracted rows
  for (const row of extractedRows) {
    await db.insert(requisitionSourceRows).values({
      tenantId,
      batchId,
      sourceFileId: files[0]?.id || "",
      sourceRecordKey: row.source_record_key,
      extractedJson: row,
      sourceConfidence: row.source_confidence,
      dataQualityNotes: row.data_quality_notes || [],
    });
  }

  // Update batch status
  const duplicatesDetected = detectDuplicates(extractedRows);
  const uncertainCount = extractedRows.filter((r) => r.source_confidence !== "High").length;

  await db
    .update(requisitionAnalysisBatches)
    .set({
      status: "awaiting_review",
      processingSummary: {
        files_processed: files.length,
        screenshots_processed: imageFiles,
        spreadsheet_rows_processed: spreadsheetRows,
        visible_rows_detected: extractedRows.length,
        potential_duplicates_detected: duplicatesDetected.length,
        uncertain_record_count: uncertainCount,
      },
    })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  return {
    batchId,
    extractedRows,
    duplicatesDetected: duplicatesDetected.length,
    uncertainCount,
  };
}

/**
 * Detect potential duplicates
 */
function detectDuplicates(rows: ExtractedRequisition[]): Array<{ key: string; duplicates: string[] }> {
  const seen = new Map<string, string[]>();
  
  for (const row of rows) {
    const key = row.requisition_id;
    if (key) {
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(row.source_record_key);
    }
  }
  
  return Array.from(seen.entries())
    .filter(([_, duplicates]) => duplicates.length > 1)
    .map(([key, duplicates]) => ({ key, duplicates }));
}

/**
 * Deduplicate and merge requisitions
 */
export async function deduplicateRequisitions(
  batchId: string,
  tenantId: string
): Promise<ExtractedRequisition[]> {
  const rows = await db
    .select()
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId),
        eq(requisitionSourceRows.excluded, false)
      )
    );

  const byReqId = new Map<string, ExtractedRequisition[]>();
  
  // Group by requisition ID
  for (const row of rows) {
    const data = row.extractedJson as ExtractedRequisition;
    const reqId = data.requisition_id;
    
    if (reqId) {
      if (!byReqId.has(reqId)) {
        byReqId.set(reqId, []);
      }
      byReqId.get(reqId)!.push(data);
    }
  }

  const merged: ExtractedRequisition[] = [];
  
  // Merge duplicates
  for (const [reqId, duplicates] of byReqId) {
    if (duplicates.length === 1) {
      merged.push(duplicates[0]);
    } else {
      const mergedRow = mergeDuplicateRows(duplicates);
      merged.push(mergedRow);
    }
  }

  // Add rows without requisition ID to unresolved
  const unresolved = rows
    .filter((row) => !(row.extractedJson as ExtractedRequisition).requisition_id)
    .map((row) => row.extractedJson as ExtractedRequisition);

  return [...merged, ...unresolved];
}

/**
 * Merge duplicate rows
 */
function mergeDuplicateRows(duplicates: ExtractedRequisition[]): ExtractedRequisition {
  const base = { ...duplicates[0] };
  const dataQualityNotes = [...(base.data_quality_notes || [])];
  
  // Merge complementary fields
  for (let i = 1; i < duplicates.length; i++) {
    const dup = duplicates[i];
    
    // Fill missing fields
    if (!base.customer && dup.customer) base.customer = dup.customer;
    if (!base.job_title && dup.job_title) base.job_title = dup.job_title;
    if (!base.location && dup.location) base.location = dup.location;
    if (!base.duration && dup.duration) base.duration = dup.duration;
    if (!base.position_type && dup.position_type) base.position_type = dup.position_type;
    if (!base.remote_or_onsite || base.remote_or_onsite === "Unknown") {
      base.remote_or_onsite = dup.remote_or_onsite;
    }
    
    // Use most recent submission count (higher is usually more recent)
    if (dup.submissions && (!base.submissions || dup.submissions > base.submissions)) {
      base.submissions = dup.submissions;
    }
    
    // Track that this was merged
    dataQualityNotes.push(`Merged from duplicate occurrence: ${dup.source_record_key}`);
  }
  
  base.data_quality_notes = dataQualityNotes;
  return base;
}

/**
 * Normalize customer name
 */
function normalizeCustomerName(name: string | null): string | null {
  if (!name) return null;
  
  // Check aliases
  for (const [alias, normalized] of Object.entries(CUSTOMER_ALIASES)) {
    if (name.toLowerCase().includes(alias.toLowerCase())) {
      return normalized;
    }
  }
  
  return name;
}

/**
 * Finalize batch and upsert requisitions
 */
export async function finalizeBatch(
  batchId: string,
  tenantId: string,
  mspProgramId: string,
  assumptions: FinancialAssumptions,
  weights: ScoringWeights
): Promise<void> {
  // Update status
  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "calculating" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  // Get deduplicated rows
  const rows = await deduplicateRequisitions(batchId, tenantId);

  // Get MSP program config
  const [program] = await db
    .select()
    .from(require("@/db/schema").mspPrograms)
    .where(
      and(
        eq(require("@/db/schema").mspPrograms.id, mspProgramId),
        eq(require("@/db/schema").mspPrograms.tenantId, tenantId)
      )
    );

  if (!program) {
    throw new Error("MSP program not found");
  }

  // Process each requisition
  const results: Array<{
    id: string;
    requisitionId: string;
    opportunityScore: number;
    estimatedProfitPerHour: number;
    submissionCount: number | null;
    durationWeeks: number | null;
    effectiveVendorRate: number;
    releasedDate: Date | null;
  }> = [];

  for (const row of rows) {
    if (!row.requisition_id) continue;
    const analyzedRow = row as ExtractedRequisition & {
      recommended_w2_pay_min?: number | null;
      recommended_w2_pay_max?: number | null;
      fillability_score?: number | null;
      pay_estimate_reason?: string | null;
      market_rate_warning?: string | null;
    };

    // Calculate pay midpoint
    const payMin = analyzedRow.recommended_w2_pay_min || 0;
    const payMax = analyzedRow.recommended_w2_pay_max || 0;
    const payMidpoint = (payMin + payMax) / 2;

    // Parse duration
    const durationWeeks = parseDurationToWeeks(row.duration);

    // Determine role risk
    let roleRisk: "Standard" | "Higher-Risk Technical" | "Healthcare" = "Standard";
    const jobTitleLower = (row.job_title || "").toLowerCase();
    if (
      jobTitleLower.includes("healthcare") ||
      jobTitleLower.includes("nurse") ||
      jobTitleLower.includes("clinical")
    ) {
      roleRisk = "Healthcare";
    } else if (
      jobTitleLower.includes("field") ||
      jobTitleLower.includes("controls") ||
      jobTitleLower.includes("manufacturing")
    ) {
      roleRisk = "Higher-Risk Technical";
    }

    // Calculate financials
    let financials;
    let requiresHealthcareReview = false;
    
    try {
      financials = calculateFinancials({
        displayedVendorRate: row.c2c_bill_rate || 0,
        selectedPayRate: payMidpoint,
        vendorFeeType: program.vendorFeeType as "percentage" | "flat_hourly" | "none",
        vendorFeeValue: parseFloat(program.vendorFeeValue),
        weeklyHours: program.defaultWeeklyHours,
        durationWeeks,
        roleRiskClassification: roleRisk,
        assumptions,
      });
    } catch (e) {
      if (roleRisk === "Healthcare") {
        requiresHealthcareReview = true;
        // Recalculate with standard rate
        financials = calculateFinancials({
          displayedVendorRate: row.c2c_bill_rate || 0,
          selectedPayRate: payMidpoint,
          vendorFeeType: program.vendorFeeType as "percentage" | "flat_hourly" | "none",
          vendorFeeValue: parseFloat(program.vendorFeeValue),
          weeklyHours: program.defaultWeeklyHours,
          durationWeeks,
          roleRiskClassification: "Standard",
          assumptions,
        });
      } else {
        throw e;
      }
    }

    // Calculate scores
    const scores = calculateScores(
      {
        submissionCount: row.submissions,
        profitPerHour: financials.estimatedProfitPerHour.toNumber(),
        fillabilityScore: analyzedRow.fillability_score || 50,
        effectiveVendorRate: financials.effectiveVendorRate.toNumber(),
        durationWeeks,
        requiresHealthcareReview,
      },
      weights
    );

    // Upsert requisition
    const now = new Date();
    const [existingReq] = await db
      .select()
      .from(requisitions)
      .where(
        and(
          eq(requisitions.requisitionId, row.requisition_id),
          eq(requisitions.mspProgramId, mspProgramId),
          eq(requisitions.tenantId, tenantId)
        )
      );

    if (existingReq) {
      // Update existing
      await db
        .update(requisitions)
        .set({
          status: row.status,
          sourceCustomerName: row.customer,
          normalizedCustomerName: normalizeCustomerName(row.customer),
          jobTitle: row.job_title,
          location: row.location,
          sourceDuration: row.duration,
          normalizedDurationWeeks: durationWeeks?.toString() || null,
          numberOfPositions: row.number_of_positions,
          submissionCount: row.submissions,
          activeSubmissionCount: row.active_submissions,
          displayedVendorRate: row.c2c_bill_rate?.toString() || null,
          releasedDate: row.released_date ? new Date(row.released_date) : null,
          positionType: row.position_type,
          remoteOrOnsite: row.remote_or_onsite || "Unknown",
          sourceConfidence: row.source_confidence,
          dataQualityNotes: row.data_quality_notes || [],
          lastSeenAt: now,
          lastAnalyzedAt: now,
          isNewToday: false,
          updatedAt: now,
        })
        .where(eq(requisitions.id, existingReq.id));
    } else {
      // Insert new
      await db.insert(requisitions).values({
        id: uuidv4(),
        tenantId,
        mspProgramId,
        requisitionId: row.requisition_id,
        status: row.status,
        sourceCustomerName: row.customer,
        normalizedCustomerName: normalizeCustomerName(row.customer),
        jobTitle: row.job_title,
        location: row.location,
        sourceDuration: row.duration,
        normalizedDurationWeeks: durationWeeks?.toString() || null,
        numberOfPositions: row.number_of_positions,
        submissionCount: row.submissions,
        activeSubmissionCount: row.active_submissions,
        displayedVendorRate: row.c2c_bill_rate?.toString() || null,
        releasedDate: row.released_date ? new Date(row.released_date) : null,
        positionType: row.position_type,
        remoteOrOnsite: row.remote_or_onsite || "Unknown",
        sourceConfidence: row.source_confidence,
        dataQualityNotes: row.data_quality_notes || [],
        firstSeenAt: now,
        lastSeenAt: now,
        lastAnalyzedAt: now,
        isNewToday: true,
      });
    }

    // Get the requisition ID
    const [reqRecord] = await db
      .select({ id: requisitions.id })
      .from(requisitions)
      .where(
        and(
          eq(requisitions.requisitionId, row.requisition_id),
          eq(requisitions.mspProgramId, mspProgramId),
          eq(requisitions.tenantId, tenantId)
        )
      );

    if (reqRecord) {
      // Upsert analysis result
      const recommendation = getRecommendationLabel(scores.opportunityScore);
      
      await db
        .insert(requisitionAnalysisResults)
        .values({
          id: uuidv4(),
          tenantId,
          requisitionId: reqRecord.id,
          recommendedPayMin: payMin.toString(),
          recommendedPayMax: payMax.toString(),
          payMidpoint: payMidpoint.toString(),
          selectedPayRate: payMidpoint.toString(),
          payScenario: "midpoint",
          payEstimateReason: analyzedRow.pay_estimate_reason || "",
          marketRateWarning: analyzedRow.market_rate_warning || null,
          roleRiskClassification: roleRisk,
          effectiveVendorRate: financials.effectiveVendorRate.toString(),
          estimatedW2Cost: financials.w2CostPerHour.toString(),
          grossSpreadPerHour: financials.grossSpreadPerHour.toString(),
          estimatedProfitPerHour: financials.estimatedProfitPerHour.toString(),
          netMarginPercent: financials.netMarginPercent.toString(),
          weeklyProfit: financials.weeklyProfit.toString(),
          assignmentProfit: financials.assignmentProfit?.toString() || null,
          competitionScore: scores.competitionScore,
          profitabilityScore: scores.profitabilityScore,
          fillabilityScore: scores.fillabilityScore,
          fillabilityLabel: getFillabilityLabel(scores.fillabilityScore),
          billRateScore: scores.billRateScore,
          durationScore: scores.durationScore,
          opportunityScore: scores.opportunityScore,
          rank: 0, // Will be updated after all calculations
          calculatedRecommendation: recommendation as any,
          finalRecommendation: recommendation as any,
          requiresManualReview: requiresHealthcareReview,
        })
        .onConflictDoUpdate({
          target: [requisitionAnalysisResults.requisitionId],
          set: {
            recommendedPayMin: payMin.toString(),
            recommendedPayMax: payMax.toString(),
            payMidpoint: payMidpoint.toString(),
            selectedPayRate: payMidpoint.toString(),
            payEstimateReason: analyzedRow.pay_estimate_reason || "",
            marketRateWarning: analyzedRow.market_rate_warning || null,
            roleRiskClassification: roleRisk,
            effectiveVendorRate: financials.effectiveVendorRate.toString(),
            estimatedW2Cost: financials.w2CostPerHour.toString(),
            grossSpreadPerHour: financials.grossSpreadPerHour.toString(),
            estimatedProfitPerHour: financials.estimatedProfitPerHour.toString(),
            netMarginPercent: financials.netMarginPercent.toString(),
            weeklyProfit: financials.weeklyProfit.toString(),
            assignmentProfit: financials.assignmentProfit?.toString() || null,
            competitionScore: scores.competitionScore,
            profitabilityScore: scores.profitabilityScore,
            fillabilityScore: scores.fillabilityScore,
            fillabilityLabel: getFillabilityLabel(scores.fillabilityScore),
            billRateScore: scores.billRateScore,
            durationScore: scores.durationScore,
            opportunityScore: scores.opportunityScore,
            calculatedRecommendation: recommendation as any,
            finalRecommendation: recommendation as any,
            requiresManualReview: requiresHealthcareReview,
            updatedAt: new Date(),
          },
        });

      results.push({
        id: reqRecord.id,
        requisitionId: row.requisition_id,
        opportunityScore: scores.opportunityScore,
        estimatedProfitPerHour: financials.estimatedProfitPerHour.toNumber(),
        submissionCount: row.submissions,
        durationWeeks,
        effectiveVendorRate: financials.effectiveVendorRate.toNumber(),
        releasedDate: row.released_date ? new Date(row.released_date) : null,
      });
    }
  }

  // Assign ranks
  const ranked = assignRanks(results);
  
  for (const item of ranked) {
    await db
      .update(requisitionAnalysisResults)
      .set({ rank: item.rank })
      .where(eq(requisitionAnalysisResults.requisitionId, item.id));
  }

  // Update batch status
  await db
    .update(requisitionAnalysisBatches)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(requisitionAnalysisBatches.id, batchId));
}

/**
 * Get batch status
 */
export async function getBatchStatus(batchId: string, tenantId: string) {
  const [batch] = await db
    .select()
    .from(requisitionAnalysisBatches)
    .where(
      and(
        eq(requisitionAnalysisBatches.id, batchId),
        eq(requisitionAnalysisBatches.tenantId, tenantId)
      )
    );

  if (!batch) {
    throw new Error("Batch not found");
  }

  const sourceFiles = await db
    .select()
    .from(requisitionSourceFiles)
    .where(eq(requisitionSourceFiles.batchId, batchId));

  const sourceRows = await db
    .select()
    .from(requisitionSourceRows)
    .where(eq(requisitionSourceRows.batchId, batchId));

  return {
    batch,
    sourceFiles,
    sourceRows,
  };
}
