import { db, sanitizeDbError } from "@/db";
import {
  requisitionAnalysisBatches,
  requisitionSourceFiles,
  requisitionSourceRows,
  requisitions,
  requisitionAnalysisResults,
  requisitionSnapshots,
  mspPrograms,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { ExtractedRequisition, FinancialAssumptions, ScoringWeights } from "@/types";
import { createRequisitionIntelligenceService } from "@/lib/ai-providers";
import {
  parseSpreadsheet,
  parseCSVBuffer,
  validateFileType,
  CsvReadError,
  CSV_READ_ERROR,
  type ImportParseSummary,
} from "@/lib/file-parsing";
import { saveUploadFile, loadUploadFile } from "@/lib/file-storage";
import {
  calculateFinancials,
  calculateScores,
  parseDurationToWeeks,
  assignRanks,
  getRecommendationLabel,
  getFillabilityLabel,
} from "@/lib/financial-calculations";
import { CUSTOMER_ALIASES } from "@/types";
import {
  annotateImportRows,
  findExistingRequisitionsByIds,
  findPossibleDuplicates,
  summarizeDuplicateAnnotations,
} from "@/lib/duplicate-check";
import {
  buildPayFirstExplanation,
  parsePayNumber,
  type PayRangeFit,
} from "@/lib/pay-range";
import {
  validatePayRecommendation,
  dedupeByRequisitionId,
  normalizeRequisitionId,
} from "@/lib/pay-validation";
import { decimalOrNull } from "@/lib/pay-normalization";
import { GROK_MODEL } from "@/lib/grok-provider";
import { GROK_PROMPT_VERSION } from "@/ai/prompts/job-ranking-grok-v1";

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

export interface FileUploadResult {
  fileId: string;
  storageKey: string;
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
export async function uploadSourceFile(input: FileUploadInput): Promise<FileUploadResult> {
  if (!validateFileType(input.mimeType, input.filename)) {
    throw new Error(`Unsupported file type: ${input.mimeType}`);
  }

  const fileId = uuidv4();
  const storageKey = await saveUploadFile(
    input.tenantId,
    input.batchId,
    input.filename,
    input.content
  );

  await db.insert(requisitionSourceFiles).values({
    id: fileId,
    tenantId: input.tenantId,
    batchId: input.batchId,
    originalFilename: input.filename,
    storageKey,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    processingStatus: "pending",
  });

  await db
    .update(requisitionAnalysisBatches)
    .set({
      filesCount: sql`${requisitionAnalysisBatches.filesCount} + 1`,
      status: "validating",
      startedAt: sql`COALESCE(${requisitionAnalysisBatches.startedAt}, NOW())`,
    })
    .where(eq(requisitionAnalysisBatches.id, input.batchId));

  return { fileId, storageKey };
}

/**
 * Process files and extract requisitions
 */
export async function processBatchExtraction(
  batchId: string,
  tenantId: string,
  _aiProvider: string = "grok"
): Promise<ExtractionResult> {
  const [existingBatch] = await db
    .select({ status: requisitionAnalysisBatches.status })
    .from(requisitionAnalysisBatches)
    .where(
      and(
        eq(requisitionAnalysisBatches.id, batchId),
        eq(requisitionAnalysisBatches.tenantId, tenantId)
      )
    );

  // Idempotent: if parse already finished, do not re-insert source rows
  if (
    existingBatch &&
    (existingBatch.status === "awaiting_review" ||
      existingBatch.status === "reviewing" ||
      existingBatch.status === "analyzing" ||
      existingBatch.status === "calculating" ||
      existingBatch.status === "completed")
  ) {
    const existingRows = await db
      .select()
      .from(requisitionSourceRows)
      .where(
        and(
          eq(requisitionSourceRows.batchId, batchId),
          eq(requisitionSourceRows.tenantId, tenantId)
        )
      );
    return {
      batchId,
      extractedRows: existingRows.map((r) => r.extractedJson as ExtractedRequisition),
      duplicatesDetected: 0,
      uncertainCount: 0,
    };
  }

  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "parsing" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  const files = await db
    .select()
    .from(requisitionSourceFiles)
    .where(
      and(
        eq(requisitionSourceFiles.batchId, batchId),
        eq(requisitionSourceFiles.tenantId, tenantId)
      )
    );

  const spreadsheetPayloads: Array<{
    filename: string;
    rows: Array<Record<string, unknown>>;
  }> = [];
  const imagePayloads: Array<{
    filename: string;
    base64: string;
    mimeType: string;
    fileId: string;
  }> = [];

  let spreadsheetRows = 0;
  let imageFiles = 0;
  let spreadsheetFiles = 0;
  const importSummaries: ImportParseSummary[] = [];

  for (const file of files) {
    try {
      const content = await loadUploadFile(file.storageKey);

      if (file.mimeType.startsWith("image/")) {
        imageFiles++;
        imagePayloads.push({
          filename: file.originalFilename,
          base64: content.toString("base64"),
          mimeType: file.mimeType,
          fileId: file.id,
        });
        await db
          .update(requisitionSourceFiles)
          .set({ processingStatus: "parsed" })
          .where(eq(requisitionSourceFiles.id, file.id));
      } else if (
        file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.mimeType === "application/vnd.ms-excel" ||
        file.originalFilename.toLowerCase().endsWith(".xlsx") ||
        file.originalFilename.toLowerCase().endsWith(".xls")
      ) {
        spreadsheetFiles++;
        const parsed = parseSpreadsheet(content, file.originalFilename);
        for (const sheet of parsed) {
          spreadsheetRows += sheet.rows.length;
          if (sheet.summary) importSummaries.push(sheet.summary);
          for (const row of sheet.rows) {
            const rowNumMatch = row.source_record_key.match(/row(\d+)$/);
            const enriched = {
              ...row,
              source_file_ids: [file.id],
              source_record_key: `${file.id}:${sheet.sheetName}:${row.source_record_key}`,
            };
            await db.insert(requisitionSourceRows).values({
              tenantId,
              batchId,
              sourceFileId: file.id,
              sourceRecordKey: enriched.source_record_key,
              sheetName: sheet.sheetName,
              rowNumber: rowNumMatch ? parseInt(rowNumMatch[1], 10) : null,
              extractedJson: enriched,
              sourceConfidence: enriched.source_confidence,
              dataQualityNotes: enriched.data_quality_notes || [],
            });
          }
          spreadsheetPayloads.push({
            filename: file.originalFilename,
            rows: sheet.rows as unknown as Array<Record<string, unknown>>,
          });
        }
        await db
          .update(requisitionSourceFiles)
          .set({ processingStatus: "parsed", pageOrSheetCount: parsed.length })
          .where(eq(requisitionSourceFiles.id, file.id));
      } else if (
        file.mimeType === "text/csv" ||
        file.mimeType === "application/csv" ||
        file.originalFilename.toLowerCase().endsWith(".csv")
      ) {
        spreadsheetFiles++;
        const parsed = parseCSVBuffer(content, file.originalFilename);
        spreadsheetRows += parsed.rows.length;
        if (parsed.summary) importSummaries.push(parsed.summary);
        for (const row of parsed.rows) {
          const rowNumMatch = row.source_record_key.match(/row(\d+)$/);
          const enriched = {
            ...row,
            source_file_ids: [file.id],
            source_record_key: `${file.id}:csv:${row.source_record_key}`,
          };
          await db.insert(requisitionSourceRows).values({
            tenantId,
            batchId,
            sourceFileId: file.id,
            sourceRecordKey: enriched.source_record_key,
            sheetName: parsed.sheetName,
            rowNumber: rowNumMatch ? parseInt(rowNumMatch[1], 10) : null,
            extractedJson: enriched,
            sourceConfidence: enriched.source_confidence,
            dataQualityNotes: enriched.data_quality_notes || [],
          });
        }
        spreadsheetPayloads.push({
          filename: file.originalFilename,
          rows: parsed.rows as unknown as Array<Record<string, unknown>>,
        });
        await db
          .update(requisitionSourceFiles)
          .set({
            processingStatus: "parsed",
            detectedEncoding: parsed.encoding || null,
          })
          .where(eq(requisitionSourceFiles.id, file.id));
      }
    } catch (err) {
      const friendly =
        err instanceof CsvReadError
          ? CSV_READ_ERROR
          : err instanceof Error && /unicode|decode|encoding|byte sequence|malformed/i.test(err.message)
            ? CSV_READ_ERROR
            : err instanceof Error
              ? err.message
              : "We could not process this file. Please try again with a CSV or Excel export.";
      await db
        .update(requisitionSourceFiles)
        .set({
          processingStatus: "failed",
          errorMessage: friendly,
        })
        .where(eq(requisitionSourceFiles.id, file.id));
    }
  }

  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "extracting" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  const extractedRows: ExtractedRequisition[] = [];

  if (imagePayloads.length > 0) {
    const provider = createRequisitionIntelligenceService();

    const result = await provider.extractRequisitions({
      images: imagePayloads.map((img) => ({
        filename: img.filename,
        base64: img.base64,
        mimeType: img.mimeType,
      })),
      spreadsheets: spreadsheetPayloads,
      promptVersion: "job-ranking-grok-v1",
    });

    for (const job of result.jobs) {
      const fileId = imagePayloads[0]?.fileId || files[0]?.id || "";
      const enriched = {
        ...job,
        source_file_ids: job.source_file_ids?.length ? job.source_file_ids : [fileId],
        source_record_key: job.source_record_key || `${fileId}:grok:${uuidv4()}`,
      };
      await db.insert(requisitionSourceRows).values({
        tenantId,
        batchId,
        sourceFileId: fileId,
        sourceRecordKey: enriched.source_record_key,
        screenshotIndex: imagePayloads.findIndex((i) => i.fileId === fileId),
        extractedJson: enriched,
        sourceConfidence: enriched.source_confidence,
        dataQualityNotes: enriched.data_quality_notes || [],
      });
      extractedRows.push(enriched as ExtractedRequisition);
    }
  }

  const allRows = await db
    .select()
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId)
      )
    );

  const allExtracted = allRows.map((r) => r.extractedJson as ExtractedRequisition);
  const duplicatesDetected = detectDuplicates(allExtracted);
  const uncertainCount = allExtracted.filter((r) => r.source_confidence !== "High").length;
  const missingIds = allExtracted.filter((r) => !r.requisition_id).length;
  const missingRates = allExtracted.filter(
    (r) => r.c2c_bill_rate === null || r.c2c_bill_rate === undefined
  ).length;
  const dateWarnings = allExtracted.filter((r) =>
    (r.data_quality_notes || []).some((n) => n.toLowerCase().includes("date"))
  ).length;
  const rowsRequiringReview = allExtracted.filter(
    (r) =>
      !r.requisition_id ||
      r.c2c_bill_rate === null ||
      r.c2c_bill_rate === undefined ||
      (r.data_quality_notes || []).length > 0 ||
      r.source_confidence !== "High"
  ).length;

  await db
    .update(requisitionAnalysisBatches)
    .set({
      status: "awaiting_review",
      processingSummary: {
        files_processed: files.length,
        screenshots_processed: imageFiles,
        spreadsheet_rows_processed: spreadsheetRows,
        visible_rows_detected: allExtracted.length,
        potential_duplicates_detected: duplicatesDetected.length,
        uncertain_record_count: uncertainCount,
        valid_rows: allExtracted.filter(
          (r) => r.requisition_id && r.c2c_bill_rate !== null && r.c2c_bill_rate !== undefined
        ).length,
        rows_requiring_review: rowsRequiringReview,
        missing_requisition_ids: missingIds,
        missing_bill_rates: missingRates,
        date_parsing_warnings: dateWarnings,
        import_summaries: importSummaries,
      },
    })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  return {
    batchId,
    extractedRows: allExtracted,
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

  const extracted = rows.map(
    (row) => (row.confirmedJson || row.extractedJson) as ExtractedRequisition
  );

  // Deterministic second pass: normalize IDs, never sum submissions
  const { unique } = dedupeByRequisitionId(extracted);
  return unique as ExtractedRequisition[];
}

/**
 * Merge duplicate rows
 */
function mergeDuplicateRows(duplicates: ExtractedRequisition[]): ExtractedRequisition {
  const base = { ...duplicates[0] };
  const dataQualityNotes = [...(base.data_quality_notes || [])];

  // Merge complementary fields — never sum submission counts
  for (let i = 1; i < duplicates.length; i++) {
    const dup = duplicates[i];

    const conflictFields: string[] = [];
    if (dup.customer && base.customer && dup.customer !== base.customer) {
      conflictFields.push(`customer ("${base.customer}" vs "${dup.customer}")`);
    }
    if (dup.job_title && base.job_title && dup.job_title !== base.job_title) {
      conflictFields.push(`job_title`);
    }
    if (
      dup.c2c_bill_rate != null &&
      base.c2c_bill_rate != null &&
      dup.c2c_bill_rate !== base.c2c_bill_rate
    ) {
      conflictFields.push(
        `bill_rate (${base.c2c_bill_rate} vs ${dup.c2c_bill_rate})`
      );
    }
    if (
      dup.submissions != null &&
      base.submissions != null &&
      dup.submissions !== base.submissions
    ) {
      conflictFields.push(
        `submissions (${base.submissions} vs ${dup.submissions}; kept higher, not summed)`
      );
    }
    if (
      dup.active_submissions != null &&
      base.active_submissions != null &&
      dup.active_submissions !== base.active_submissions
    ) {
      conflictFields.push(
        `active_submissions (${base.active_submissions} vs ${dup.active_submissions}; kept higher, not summed)`
      );
    }

    if (!base.customer && dup.customer) base.customer = dup.customer;
    if (!base.job_title && dup.job_title) base.job_title = dup.job_title;
    if (!base.location && dup.location) base.location = dup.location;
    if (!base.duration && dup.duration) base.duration = dup.duration;
    if (!base.position_type && dup.position_type) base.position_type = dup.position_type;
    if (!base.remote_or_onsite || base.remote_or_onsite === "Unknown") {
      base.remote_or_onsite = dup.remote_or_onsite;
    }
    if (base.c2c_bill_rate == null && dup.c2c_bill_rate != null) {
      base.c2c_bill_rate = dup.c2c_bill_rate;
      base.c2c_bill_rate_normalized = dup.c2c_bill_rate_normalized;
      base.source_c2c_bill_rate = dup.source_c2c_bill_rate;
    }

    // Prefer higher counts — never add them together
    if (dup.submissions != null && (base.submissions == null || dup.submissions > base.submissions)) {
      base.submissions = dup.submissions;
    }
    if (
      dup.active_submissions != null &&
      (base.active_submissions == null || dup.active_submissions > base.active_submissions)
    ) {
      base.active_submissions = dup.active_submissions;
    }

    dataQualityNotes.push(`Merged from duplicate occurrence: ${dup.source_record_key}`);
    if (conflictFields.length > 0) {
      dataQualityNotes.push(`Conflicting values recorded: ${conflictFields.join("; ")}`);
      base.source_confidence = "Medium";
    }
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
 * Run Grok pay and fillability analysis on confirmed rows
 */
export async function runPayAnalysis(
  batchId: string,
  tenantId: string
): Promise<void> {
  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "analyzing" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

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

  const jobs = rows
    .map((row) => {
      const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
      return {
        requisition_id: normalizeRequisitionId(data.requisition_id) || "",
        job_title: data.job_title,
        customer: data.customer,
        location: data.location,
        duration: data.duration,
        c2c_bill_rate: data.c2c_bill_rate,
        position_type: data.position_type,
        remote_or_onsite: data.remote_or_onsite,
        submissions: data.submissions,
      };
    })
    .filter((j) => j.requisition_id);

  if (jobs.length === 0) {
    return;
  }

  const writeProgress = async (progress: {
    analyzed: number;
    total: number;
    currentChunk: number;
    totalChunks: number;
    stage: string;
  }) => {
    const [existing] = await db
      .select({ processingSummary: requisitionAnalysisBatches.processingSummary })
      .from(requisitionAnalysisBatches)
      .where(eq(requisitionAnalysisBatches.id, batchId));
    const summary = {
      ...((existing?.processingSummary as Record<string, unknown>) || {}),
      pay_analysis_progress: progress,
    };
    await db
      .update(requisitionAnalysisBatches)
      .set({ processingSummary: summary, updatedAt: new Date() })
      .where(eq(requisitionAnalysisBatches.id, batchId));
  };

  try {
    await writeProgress({
      analyzed: 0,
      total: jobs.length,
      currentChunk: 0,
      totalChunks: Math.ceil(jobs.length / 8),
      stage: "analyzing_grok",
    });

    const provider = createRequisitionIntelligenceService();
    const analysis = await provider.estimatePayAndFillability({
      jobs,
      promptVersion: GROK_PROMPT_VERSION,
      onProgress: writeProgress,
    });

    const analysisByReqId = new Map(
      analysis.jobs.map((j) => [j.requisition_id, j] as const)
    );

    for (const row of rows) {
      const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
      const reqId = normalizeRequisitionId(data.requisition_id);
      if (!reqId) continue;
      const pay = analysisByReqId.get(reqId);

      if (!pay) {
        const enriched = {
          ...data,
          requisition_id: reqId,
          recommended_w2_pay_min: null,
          recommended_w2_pay_max: null,
          market_pay_floor: null,
          bill_rate_supports_market_pay: null,
          pay_estimate_reason:
            "Grok pay analysis unavailable for this requisition. Requires manual market pay review.",
          pay_range_confidence: "Low" as const,
          pay_range_fit: "Requires Review" as const,
          market_rate_warning: "Pay analysis missing; do not recruit until pay is reviewed",
          fillability_score: 50,
          fillability_label: "Difficult" as const,
          requires_pay_review: true,
          data_quality_notes: [
            ...(Array.isArray(data.data_quality_notes) ? data.data_quality_notes : []),
            "No Grok pay result for this requisition (chunk failed or omitted).",
          ],
        };
        await db
          .update(requisitionSourceRows)
          .set({ confirmedJson: enriched })
          .where(eq(requisitionSourceRows.id, row.id));
        continue;
      }

      const validated = validatePayRecommendation({
        requisitionId: reqId,
        recommendedMin: pay.recommended_w2_pay_min,
        recommendedMax: pay.recommended_w2_pay_max,
        marketPayFloor: pay.market_pay_floor,
        marketPayConfidence: pay.market_pay_confidence,
        payRecommendationReason: pay.pay_recommendation_reason || pay.pay_estimate_reason,
        billRateSupportsMarketPay: pay.bill_rate_supports_market_pay,
        billRate: data.c2c_bill_rate,
        jobTitle: data.job_title,
        payRangeFit: pay.pay_range_fit,
        marketRateWarning: pay.market_rate_warning,
      });

      if (validated.calculationAdjustments.length > 0) {
        console.info("[pay.validation.adjustments]", {
          requisition_id: reqId,
          adjustments: validated.calculationAdjustments,
        });
      }

      const qualityNotes = [
        ...(Array.isArray(data.data_quality_notes) ? data.data_quality_notes : []),
        ...validated.dataQualityNotes,
      ];

      const enriched = {
        ...data,
        requisition_id: reqId,
        recommended_w2_pay_min: validated.recommendedMin,
        recommended_w2_pay_max: validated.recommendedMax,
        market_pay_floor: validated.marketPayFloor,
        market_pay_confidence: validated.marketPayConfidence,
        bill_rate_supports_market_pay: validated.billRateSupportsMarketPay,
        pay_estimate_reason: validated.payRecommendationReason,
        pay_recommendation_reason: validated.payRecommendationReason,
        pay_range_confidence: validated.marketPayConfidence,
        pay_range_fit: validated.payRangeFit,
        market_rate_warning: validated.marketRateWarning,
        fillability_score: pay.fillability_score,
        fillability_label: pay.fillability_label,
        fillability_reason: pay.fillability_reason,
        suggested_risk_classification: pay.suggested_risk_classification,
        data_quality_notes: qualityNotes,
        requires_pay_review: validated.requiresReview,
      };

      await db
        .update(requisitionSourceRows)
        .set({ confirmedJson: enriched })
        .where(eq(requisitionSourceRows.id, row.id));
    }

    await writeProgress({
      analyzed: jobs.length,
      total: jobs.length,
      currentChunk: Math.ceil(jobs.length / 8),
      totalChunks: Math.ceil(jobs.length / 8),
      stage: "complete",
    });
  } catch (err) {
    console.error("Pay analysis failed; marking rows for review (no bill-rate pay cut):", err);
    await writeProgress({
      analyzed: 0,
      total: jobs.length,
      currentChunk: 0,
      totalChunks: Math.ceil(jobs.length / 8),
      stage: "failed",
    });
    for (const row of rows) {
      const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
      if (!data.requisition_id) continue;
      const enriched = {
        ...data,
        recommended_w2_pay_min: null,
        recommended_w2_pay_max: null,
        market_pay_floor: null,
        bill_rate_supports_market_pay: null,
        pay_estimate_reason:
          "Grok pay analysis unavailable. Requires manual market pay review — pay was not lowered from bill rate.",
        pay_range_confidence: "Low" as const,
        pay_range_fit: "Requires Review" as const,
        market_rate_warning: "Pay analysis failed; do not recruit until pay is reviewed",
        fillability_score: 50,
        fillability_label: "Difficult" as const,
        requires_pay_review: true,
        data_quality_notes: [
          ...(Array.isArray(data.data_quality_notes) ? data.data_quality_notes : []),
          "Grok pay analysis failed; record flagged for manual review.",
        ],
      };
      await db
        .update(requisitionSourceRows)
        .set({ confirmedJson: enriched })
        .where(eq(requisitionSourceRows.id, row.id));
    }
  }
}

/**
 * Get rows for review with Neon + in-batch duplicate annotations.
 */
export async function getReviewRows(batchId: string, tenantId: string) {
  const [batch] = await db
    .select({
      mspProgramId: requisitionAnalysisBatches.mspProgramId,
    })
    .from(requisitionAnalysisBatches)
    .where(
      and(
        eq(requisitionAnalysisBatches.id, batchId),
        eq(requisitionAnalysisBatches.tenantId, tenantId)
      )
    );

  const rows = await db
    .select({
      row: requisitionSourceRows,
      file: requisitionSourceFiles,
    })
    .from(requisitionSourceRows)
    .leftJoin(
      requisitionSourceFiles,
      eq(requisitionSourceRows.sourceFileId, requisitionSourceFiles.id)
    )
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId)
      )
    );

  const dataRows = rows.map(({ row }) => {
    const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
    return data;
  });

  const reqIds = dataRows
    .map((d) => d.requisition_id)
    .filter((id): id is string => Boolean(id));

  const existingByReqId = batch?.mspProgramId
    ? await findExistingRequisitionsByIds({
        tenantId,
        mspProgramId: batch.mspProgramId,
        requisitionIds: reqIds,
      })
    : new Map();

  const missingIdCandidates = dataRows.filter((d) => !d.requisition_id);
  const possibleBySignature = batch?.mspProgramId
    ? await findPossibleDuplicates({
        tenantId,
        mspProgramId: batch.mspProgramId,
        candidates: missingIdCandidates.map((d) => ({
          customer: d.customer,
          job_title: d.job_title,
          location: d.location,
        })),
      })
    : new Map();

  const annotated = annotateImportRows({
    rows: dataRows,
    existingByReqId,
    possibleBySignature,
  });

  const checkedAt = new Date();
  await Promise.all(
    rows.map(async ({ row }, index) => {
      const dup = annotated[index].duplicate;
      await db
        .update(requisitionSourceRows)
        .set({
          duplicateStatus: dup.duplicateStatus,
          matchedExistingRequisitionId: dup.matchedExistingRequisitionId,
          duplicateMatchReason: dup.duplicateMatchReason,
          duplicateCheckedAt: checkedAt,
        })
        .where(eq(requisitionSourceRows.id, row.id));
    })
  );

  const summary = summarizeDuplicateAnnotations(
    annotated.map((row) => ({
      requisition_id: row.requisition_id,
      duplicate: row.duplicate,
    }))
  );

  return {
    rows: rows.map(({ row, file }, index) => {
      const data = annotated[index];
      const { duplicate, ...requisitionData } = data;
      return {
        id: row.id,
        excluded: row.excluded,
        sourceFilename: file?.originalFilename || "",
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        data: requisitionData as ExtractedRequisition,
        sourceConfidence: row.sourceConfidence,
        dataQualityNotes: (row.dataQualityNotes as string[]) || [],
        manuallyEdited: row.manuallyEdited,
        duplicateStatus: duplicate.duplicateStatus,
        duplicateMatchReason: duplicate.duplicateMatchReason,
        matchedExistingRequisitionId: duplicate.matchedExistingRequisitionId,
        existingRecord: duplicate.existing
          ? {
              id: duplicate.existing.id,
              requisitionId: duplicate.existing.requisitionId,
              status: duplicate.existing.status,
              customer:
                duplicate.existing.normalizedCustomerName ||
                duplicate.existing.sourceCustomerName,
              jobTitle: duplicate.existing.jobTitle,
              location: duplicate.existing.location,
              billRate: duplicate.existing.displayedVendorRate,
              submissionCount: duplicate.existing.submissionCount,
              activeSubmissionCount: duplicate.existing.activeSubmissionCount,
              duration: duplicate.existing.sourceDuration,
              firstSeenAt: duplicate.existing.firstSeenAt,
              lastSeenAt: duplicate.existing.lastSeenAt,
              lastAnalyzedAt: duplicate.existing.lastAnalyzedAt,
              recommendedPayMin: duplicate.existing.recommendedPayMin,
              recommendedPayMax: duplicate.existing.recommendedPayMax,
            }
          : null,
        batchOccurrenceCount: duplicate.batchOccurrenceCount,
      };
    }),
    duplicateSummary: summary,
  };
}

/**
 * Update a source row during review
 */
export async function updateSourceRow(
  rowId: string,
  tenantId: string,
  updates: Partial<ExtractedRequisition> & { excluded?: boolean }
) {
  const [existing] = await db
    .select()
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.id, rowId),
        eq(requisitionSourceRows.tenantId, tenantId)
      )
    );

  if (!existing) throw new Error("Row not found");

  const current = (existing.confirmedJson || existing.extractedJson) as ExtractedRequisition;
  const { excluded, ...fieldUpdates } = updates;
  const merged = { ...current, ...fieldUpdates };

  await db
    .update(requisitionSourceRows)
    .set({
      confirmedJson: merged,
      excluded: excluded ?? existing.excluded,
      manuallyEdited: true,
      editedAt: new Date(),
    })
    .where(eq(requisitionSourceRows.id, rowId));
}

/**
 * Confirm all non-excluded rows before analysis
 */
export async function confirmReviewRows(batchId: string, tenantId: string) {
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

  for (const row of rows) {
    if (!row.confirmedJson) {
      await db
        .update(requisitionSourceRows)
        .set({ confirmedJson: row.extractedJson })
        .where(eq(requisitionSourceRows.id, row.id));
    }
  }

  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "reviewing" })
    .where(eq(requisitionAnalysisBatches.id, batchId));
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
): Promise<{
  sourceRowCount: number;
  uniqueRequisitionCount: number;
  analysesCompleted: number;
  analysesPending: number;
  requiresReview: number;
  newRecordsCreated: number;
  existingRecordsUpdated: number;
  unchangedExistingRecords: number;
  duplicatesConsolidated: number;
  possibleDuplicatesRemaining: number;
  analysisRecordsCreated: number;
  analysisRecordsReused: number;
}> {
  console.info("[finalize.start]", { batch_id: batchId, tenant_id: tenantId });

  // Update status
  await db
    .update(requisitionAnalysisBatches)
    .set({ status: "calculating" })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  const [sourceRowCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId)
      )
    );
  const sourceRowCount = Number(sourceRowCountRow?.count) || 0;

  const [excludedCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId),
        eq(requisitionSourceRows.excluded, true)
      )
    );
  const excludedCount = Number(excludedCountRow?.count) || 0;

  // Get deduplicated rows
  const rows = await deduplicateRequisitions(batchId, tenantId);

  const [program] = await db
    .select()
    .from(mspPrograms)
    .where(
      and(
        eq(mspPrograms.id, mspProgramId),
        eq(mspPrograms.tenantId, tenantId)
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
    requiresManualReview: boolean;
  }> = [];

  let newRecordsCreated = 0;
  let existingRecordsUpdated = 0;
  let unchangedExistingRecords = 0;
  let analysisRecordsCreated = 0;
  const analysisRecordsReused = 0;

  const includedSourceRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId),
        eq(requisitionSourceRows.excluded, false)
      )
    );
  const includedCount = Number(includedSourceRows[0]?.count) || 0;
  const duplicatesConsolidated = Math.max(0, includedCount - rows.length);
  const possibleDuplicatesRemaining = rows.filter((r) => !r.requisition_id).length;

  for (const row of rows) {
    if (!row.requisition_id) continue;
    const analyzedRow = row as ExtractedRequisition & {
      recommended_w2_pay_min?: number | null;
      recommended_w2_pay_max?: number | null;
      market_pay_floor?: number | null;
      market_pay_confidence?: "High" | "Medium" | "Low" | null;
      bill_rate_supports_market_pay?: boolean | null;
      fillability_score?: number | null;
      pay_estimate_reason?: string | null;
      pay_recommendation_reason?: string | null;
      market_rate_warning?: string | null;
      pay_range_fit?: PayRangeFit | null;
      pay_range_confidence?: "High" | "Medium" | "Low" | null;
      fillability_reason?: string | null;
      requires_pay_review?: boolean;
    };

    const payValidated = validatePayRecommendation({
      requisitionId: row.requisition_id,
      recommendedMin: analyzedRow.recommended_w2_pay_min ?? null,
      recommendedMax: analyzedRow.recommended_w2_pay_max ?? null,
      marketPayFloor: analyzedRow.market_pay_floor,
      marketPayConfidence:
        analyzedRow.market_pay_confidence || analyzedRow.pay_range_confidence,
      payRecommendationReason:
        analyzedRow.pay_recommendation_reason || analyzedRow.pay_estimate_reason,
      billRateSupportsMarketPay: analyzedRow.bill_rate_supports_market_pay,
      billRate: parsePayNumber(row.c2c_bill_rate),
      jobTitle: row.job_title,
      payRangeFit: analyzedRow.pay_range_fit,
      marketRateWarning: analyzedRow.market_rate_warning,
    });

    if (payValidated.calculationAdjustments.length > 0) {
      console.info("[finalize.pay.adjustments]", {
        requisition_id: row.requisition_id,
        adjustments: payValidated.calculationAdjustments,
      });
    }

    // NEVER coerce missing pay to 0 — keep null
    const payMin = payValidated.recommendedMin;
    const payMax = payValidated.recommendedMax;
    const payMidpoint = payValidated.midpoint;
    const payRangeFit = payValidated.payRangeFit;
    const payAvailable =
      payMin !== null &&
      payMax !== null &&
      payMidpoint !== null &&
      payMidpoint > 0;
    const payEstimateReason =
      payValidated.payRecommendationReason ||
      buildPayFirstExplanation({
        payMin,
        payMax,
        payRangeFit,
        fillabilityLabel: getFillabilityLabel(analyzedRow.fillability_score || 50),
        submissionCount: row.submissions,
        marketRateWarning: payValidated.marketRateWarning,
      });

    // Parse duration
    const durationWeeks =
      row.normalized_duration_weeks ?? parseDurationToWeeks(row.duration);

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

    const billRateRaw =
      row.c2c_bill_rate_normalized || row.c2c_bill_rate || null;
    const billRateNumber =
      billRateRaw === null || billRateRaw === undefined
        ? null
        : parsePayNumber(
            typeof billRateRaw === "number" ? billRateRaw : String(billRateRaw)
          );

    // Calculate financials — never use zero pay
    let financials = calculateFinancials({
      displayedVendorRate: billRateNumber,
      selectedPayRate: payAvailable ? payMidpoint : null,
      vendorFeeType: program.vendorFeeType as "percentage" | "flat_hourly" | "none",
      vendorFeeValue: parseFloat(program.vendorFeeValue),
      weeklyHours: program.defaultWeeklyHours,
      durationWeeks,
      roleRiskClassification: roleRisk,
      assumptions,
    });

    const requiresHealthcareReview = roleRisk === "Healthcare";
    if (requiresHealthcareReview && financials.status === "complete") {
      // Healthcare WC rate needs manual review; use Standard burden for interim display
      financials = calculateFinancials({
        displayedVendorRate: billRateNumber,
        selectedPayRate: payAvailable ? payMidpoint : null,
        vendorFeeType: program.vendorFeeType as "percentage" | "flat_hourly" | "none",
        vendorFeeValue: parseFloat(program.vendorFeeValue),
        weeklyHours: program.defaultWeeklyHours,
        durationWeeks,
        roleRiskClassification: "Standard",
        assumptions,
      });
    }

    const financialsComplete = financials.status === "complete";
    const calculationStatusLabel =
      financials.status === "incomplete_pay_unavailable"
        ? "Incomplete - pay recommendation unavailable"
        : financials.status === "incomplete_bill_rate_unavailable"
          ? "Incomplete - bill rate unavailable"
          : "complete";

    // Calculate scores
    const scores = calculateScores(
      {
        submissionCount: row.submissions,
        profitPerHour: financials.estimatedProfitPerHour?.toNumber() ?? null,
        fillabilityScore: analyzedRow.fillability_score || 50,
        effectiveVendorRate: financials.effectiveVendorRate?.toNumber() ?? null,
        durationWeeks,
        requiresHealthcareReview,
        payAvailable: payAvailable && financialsComplete,
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
      const billChanged =
        (row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null) !==
        existingReq.displayedVendorRate;
      const titleChanged = (row.job_title || null) !== existingReq.jobTitle;
      const submissionsChanged =
        (row.submissions ?? null) !== (existingReq.submissionCount ?? null);
      const statusChanged = (row.status || null) !== (existingReq.status || null);
      const changed = billChanged || titleChanged || submissionsChanged || statusChanged;

      const prevSubs = existingReq.submissionCount ?? null;
      const newSubs = row.submissions ?? null;
      const submissionCountChange =
        prevSubs != null && newSubs != null ? newSubs - prevSubs : null;

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
          displayedVendorRate:
            row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null,
          releasedDate: row.released_date ? new Date(row.released_date) : null,
          positionType: row.position_type,
          remoteOrOnsite: row.remote_or_onsite || "Unknown",
          sourceConfidence: row.source_confidence,
          dataQualityNotes: [
            ...(row.data_quality_notes || []),
            ...payValidated.dataQualityNotes,
          ],
          lastSeenAt: now,
          lastAnalyzedAt: now,
          isNewToday: false,
          isNoLongerVisible: false,
          previousSubmissionCount: prevSubs,
          submissionCountChange,
          previousStatus: existingReq.status,
          statusChange: statusChanged
            ? `${existingReq.status || "null"} → ${row.status || "null"}`
            : existingReq.statusChange,
          updatedAt: now,
        })
        .where(eq(requisitions.id, existingReq.id));

      if (changed) {
        existingRecordsUpdated += 1;
        await db.insert(auditLogs).values({
          id: uuidv4(),
          tenantId,
          action: "requisition.updated_from_import",
          entityType: "requisition",
          entityId: existingReq.id,
          previousState: {
            billRate: existingReq.displayedVendorRate,
            jobTitle: existingReq.jobTitle,
            submissionCount: existingReq.submissionCount,
          },
          newState: {
            billRate:
              row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null,
            jobTitle: row.job_title,
            submissionCount: row.submissions,
            batchId,
          },
        });
      } else {
        unchangedExistingRecords += 1;
      }
    } else {
      // Insert new — conflict-safe against concurrent imports of the same key
      await db
        .insert(requisitions)
        .values({
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
          displayedVendorRate:
            row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null,
          releasedDate: row.released_date ? new Date(row.released_date) : null,
          positionType: row.position_type,
          remoteOrOnsite: row.remote_or_onsite || "Unknown",
          sourceConfidence: row.source_confidence,
          dataQualityNotes: row.data_quality_notes || [],
          firstSeenAt: now,
          lastSeenAt: now,
          lastAnalyzedAt: now,
          isNewToday: true,
        })
        .onConflictDoUpdate({
          target: [
            requisitions.tenantId,
            requisitions.mspProgramId,
            requisitions.requisitionId,
          ],
          set: {
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
            displayedVendorRate:
              row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null,
            releasedDate: row.released_date ? new Date(row.released_date) : null,
            positionType: row.position_type,
            remoteOrOnsite: row.remote_or_onsite || "Unknown",
            sourceConfidence: row.source_confidence,
            dataQualityNotes: row.data_quality_notes || [],
            lastSeenAt: now,
            lastAnalyzedAt: now,
            isNewToday: false,
            updatedAt: now,
          },
        });
      newRecordsCreated += 1;
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
      let recommendation = getRecommendationLabel(scores.opportunityScore);
      const negativeProfit =
        financialsComplete &&
        financials.estimatedProfitPerHour !== null &&
        financials.estimatedProfitPerHour.lte(0);
      const billUnsupported = payValidated.billRateSupportsMarketPay === false;

      // High opportunity score must not hide negative operating margin / inadequate bill
      if (negativeProfit || billUnsupported) {
        if (
          recommendation === "Recruit Immediately" ||
          recommendation === "High Priority" ||
          recommendation === "Good Opportunity"
        ) {
          recommendation = "Candidate Driven";
        }
      }

      const requiresManualReview =
        requiresHealthcareReview ||
        payValidated.requiresReview ||
        analyzedRow.requires_pay_review === true ||
        !payAvailable ||
        !financialsComplete;

      const payEstimateReasonFinal =
        !payAvailable || !financialsComplete
          ? `${payEstimateReason} [${calculationStatusLabel}]`
          : payEstimateReason;

      const analysisPayFields = {
        recommendedPayMin: decimalOrNull(payMin),
        recommendedPayMax: decimalOrNull(payMax),
        payMidpoint: decimalOrNull(payMidpoint),
        selectedPayRate: decimalOrNull(payMidpoint),
        payScenario: "midpoint" as const,
        payEstimateReason: payEstimateReasonFinal,
        payRangeConfidence: payValidated.marketPayConfidence || "Medium",
        payRangeFit,
        marketRateWarning: payValidated.marketRateWarning || null,
        marketPayFloor: decimalOrNull(payValidated.marketPayFloor),
        billRateSupportsMarketPay: payValidated.billRateSupportsMarketPay,
        roleRiskClassification: roleRisk,
        effectiveVendorRate: financials.effectiveVendorRate?.toString() ?? null,
        estimatedW2Cost: financials.w2CostPerHour?.toString() ?? null,
        grossSpreadPerHour: financials.grossSpreadPerHour?.toString() ?? null,
        estimatedProfitPerHour:
          financials.estimatedProfitPerHour?.toString() ?? null,
        netMarginPercent: financials.netMarginPercent?.toString() ?? null,
        weeklyProfit: financials.weeklyProfit?.toString() ?? null,
        assignmentProfit: financials.assignmentProfit?.toString() ?? null,
        competitionScore: scores.competitionScore,
        profitabilityScore: financialsComplete
          ? scores.profitabilityScore
          : null,
        fillabilityScore: scores.fillabilityScore,
        fillabilityLabel: getFillabilityLabel(scores.fillabilityScore),
        billRateScore: scores.billRateScore,
        durationScore: scores.durationScore,
        opportunityScore: scores.opportunityScore,
        calculatedRecommendation: recommendation,
        finalRecommendation: recommendation,
        requiresManualReview,
        claudeModel: GROK_MODEL,
        promptVersion: GROK_PROMPT_VERSION,
      };
      
      await db
        .insert(requisitionAnalysisResults)
        .values({
          id: uuidv4(),
          tenantId,
          requisitionId: reqRecord.id,
          batchId,
          ...analysisPayFields,
          rank: 0, // Will be updated after all calculations
        })
        .onConflictDoUpdate({
          target: [requisitionAnalysisResults.requisitionId],
          set: {
            batchId,
            ...analysisPayFields,
            updatedAt: new Date(),
          },
        });

      analysisRecordsCreated += 1;

      await db.insert(requisitionSnapshots).values({
        id: uuidv4(),
        tenantId,
        requisitionId: reqRecord.id,
        batchId,
        sourceValues: row,
        recommendedPayMin: analysisPayFields.recommendedPayMin,
        recommendedPayMax: analysisPayFields.recommendedPayMax,
        payMidpoint: analysisPayFields.payMidpoint,
        selectedPayRate: analysisPayFields.selectedPayRate,
        payScenario: "midpoint",
        payEstimateReason: analysisPayFields.payEstimateReason,
        payRangeConfidence: analysisPayFields.payRangeConfidence,
        payRangeFit,
        marketRateWarning: analysisPayFields.marketRateWarning,
        marketPayFloor: analysisPayFields.marketPayFloor,
        billRateSupportsMarketPay: analysisPayFields.billRateSupportsMarketPay,
        roleRiskClassification: roleRisk,
        effectiveVendorRate: analysisPayFields.effectiveVendorRate,
        estimatedW2Cost: analysisPayFields.estimatedW2Cost,
        grossSpreadPerHour: analysisPayFields.grossSpreadPerHour,
        estimatedProfitPerHour: analysisPayFields.estimatedProfitPerHour,
        netMarginPercent: analysisPayFields.netMarginPercent,
        weeklyProfit: analysisPayFields.weeklyProfit,
        assignmentProfit: analysisPayFields.assignmentProfit,
        competitionScore: scores.competitionScore,
        profitabilityScore: analysisPayFields.profitabilityScore,
        fillabilityScore: scores.fillabilityScore,
        fillabilityLabel: getFillabilityLabel(scores.fillabilityScore),
        billRateScore: scores.billRateScore,
        durationScore: scores.durationScore,
        opportunityScore: scores.opportunityScore,
        rank: 0,
        calculatedRecommendation: recommendation,
      });

      results.push({
        id: reqRecord.id,
        requisitionId: row.requisition_id,
        opportunityScore: scores.opportunityScore,
        estimatedProfitPerHour:
          financials.estimatedProfitPerHour?.toNumber() ?? 0,
        submissionCount: row.submissions,
        durationWeeks,
        effectiveVendorRate: financials.effectiveVendorRate?.toNumber() ?? 0,
        releasedDate: row.released_date ? new Date(row.released_date) : null,
        requiresManualReview,
      });
    }
  }

  // Mark requisitions not present in this import as no longer visible (current context only)
  const seenIds = results.map((r) => r.requisitionId);
  if (seenIds.length > 0) {
    await db
      .update(requisitions)
      .set({ isNoLongerVisible: true, updatedAt: new Date() })
      .where(
        and(
          eq(requisitions.tenantId, tenantId),
          eq(requisitions.mspProgramId, mspProgramId),
          sql`${requisitions.requisitionId} NOT IN (${sql.join(
            seenIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      );
  }

  // Assign ranks
  const ranked = assignRanks(results);

  for (const item of ranked) {
    await db
      .update(requisitionAnalysisResults)
      .set({ rank: item.rank })
      .where(eq(requisitionAnalysisResults.requisitionId, item.id));
  }

  const uniqueRequisitionCount = results.length;
  const requiresManualReviewCount = results.filter((r) => r.requiresManualReview).length;

  if (uniqueRequisitionCount === 0 && excludedCount < sourceRowCount) {
    await db
      .update(requisitionAnalysisBatches)
      .set({
        status: "failed",
        errorCode: "ZERO_FINALIZED",
        sanitizedErrorMessage:
          "Finalization produced zero requisitions while source rows were not all excluded.",
        completedAt: new Date(),
      })
      .where(eq(requisitionAnalysisBatches.id, batchId));
    throw new Error(
      "A batch cannot complete with zero finalized requisitions unless all reviewed rows were excluded."
    );
  }

  const [existingBatch] = await db
    .select({ processingSummary: requisitionAnalysisBatches.processingSummary })
    .from(requisitionAnalysisBatches)
    .where(eq(requisitionAnalysisBatches.id, batchId));

  const summary = {
    ...((existingBatch?.processingSummary as Record<string, unknown>) || {}),
    sourceRowCount,
    uniqueRequisitionCount,
    analysesCompleted: uniqueRequisitionCount,
    analysesPending: 0,
    requiresReview: requiresManualReviewCount,
    excludedCount,
    newRecordsCreated,
    existingRecordsUpdated,
    unchangedExistingRecords,
    duplicatesConsolidated,
    possibleDuplicatesRemaining,
    analysisRecordsCreated,
    analysisRecordsReused,
  };

  await db
    .update(requisitionAnalysisBatches)
    .set({
      status: "completed",
      completedAt: new Date(),
      processingSummary: summary,
    })
    .where(eq(requisitionAnalysisBatches.id, batchId));

  console.info("[finalize.complete]", {
    batch_id: batchId,
    tenant_id: tenantId,
    requisition_count: uniqueRequisitionCount,
    source_row_count: sourceRowCount,
    new_records_created: newRecordsCreated,
    existing_records_updated: existingRecordsUpdated,
  });

  return {
    sourceRowCount,
    uniqueRequisitionCount,
    analysesCompleted: uniqueRequisitionCount,
    analysesPending: 0,
    requiresReview: requiresManualReviewCount,
    newRecordsCreated,
    existingRecordsUpdated,
    unchangedExistingRecords,
    duplicatesConsolidated,
    possibleDuplicatesRemaining,
    analysisRecordsCreated,
    analysisRecordsReused,
  };
}

/**
 * Mark a batch as failed with a sanitized error (avoids stuck analyzing/calculating).
 */
export async function markBatchFailed(
  batchId: string,
  errorCode: string,
  message: string
): Promise<void> {
  const safe =
    /Failed query/i.test(message) || message.length > 200
      ? sanitizeDbError(new Error(message))
      : message.slice(0, 500);

  await db
    .update(requisitionAnalysisBatches)
    .set({
      status: "failed",
      errorCode,
      sanitizedErrorMessage: safe,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(requisitionAnalysisBatches.id, batchId));
}

/**
 * Get batch status (lightweight — for polling; does not return full extracted JSON)
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
    const err = new Error("Batch not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }

  const sourceFiles = await db
    .select({
      id: requisitionSourceFiles.id,
      originalFilename: requisitionSourceFiles.originalFilename,
      processingStatus: requisitionSourceFiles.processingStatus,
      errorMessage: requisitionSourceFiles.errorMessage,
      mimeType: requisitionSourceFiles.mimeType,
    })
    .from(requisitionSourceFiles)
    .where(eq(requisitionSourceFiles.batchId, batchId));

  const [rowCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requisitionSourceRows)
    .where(
      and(
        eq(requisitionSourceRows.batchId, batchId),
        eq(requisitionSourceRows.tenantId, tenantId)
      )
    );

  return {
    batch: {
      id: batch.id,
      status: batch.status,
      mspProgramId: batch.mspProgramId,
      processingSummary: batch.processingSummary,
      sanitizedErrorMessage: batch.sanitizedErrorMessage,
      errorCode: batch.errorCode,
      filesCount: batch.filesCount,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
    },
    sourceFiles,
    /** Lightweight placeholders so older clients that expect an array keep working */
    sourceRows: Array.from({ length: rowCount?.count ?? 0 }, (_, i) => ({
      id: `row-${i}`,
    })),
    sourceRowCount: rowCount?.count ?? 0,
  };
}
