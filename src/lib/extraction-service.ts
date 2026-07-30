import { db } from "@/db";
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
import Decimal from "decimal.js";
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
  calculateW2CostPerHour,
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
  derivePayRangeFit,
  parsePayNumber,
  type PayRangeFit,
} from "@/lib/pay-range";

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
  aiProvider: string = "claude"
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
    const provider = createRequisitionIntelligenceService(
      aiProvider === "claude" ? undefined : aiProvider
    );

    const result = await provider.extractRequisitions({
      images: imagePayloads.map((img) => ({
        filename: img.filename,
        base64: img.base64,
        mimeType: img.mimeType,
      })),
      spreadsheets: spreadsheetPayloads,
      promptVersion: "v1.0",
    });

    for (const job of result.jobs) {
      const fileId = imagePayloads[0]?.fileId || files[0]?.id || "";
      const enriched = {
        ...job,
        source_file_ids: job.source_file_ids?.length ? job.source_file_ids : [fileId],
        source_record_key: job.source_record_key || `${fileId}:claude:${uuidv4()}`,
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

  const byReqId = new Map<string, ExtractedRequisition[]>();
  
  // Group by requisition ID
  for (const row of rows) {
    const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
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
    .filter((row) => !((row.confirmedJson || row.extractedJson) as ExtractedRequisition).requisition_id)
    .map((row) => (row.confirmedJson || row.extractedJson) as ExtractedRequisition);

  return [...merged, ...unresolved];
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
 * Run Claude pay and fillability analysis on confirmed rows
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
        requisition_id: data.requisition_id || "",
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

  try {
    const provider = createRequisitionIntelligenceService();
    const analysis = await provider.estimatePayAndFillability({
      jobs,
      promptVersion: "v1.0",
    });

    const analysisByReqId = new Map(analysis.jobs.map((j) => [j.requisition_id, j]));

    for (const row of rows) {
      const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
      if (!data.requisition_id) continue;
      const pay = analysisByReqId.get(data.requisition_id);
      if (!pay) continue;

      const enriched = {
        ...data,
        recommended_w2_pay_min: pay.recommended_w2_pay_min,
        recommended_w2_pay_max: pay.recommended_w2_pay_max,
        pay_estimate_reason: pay.pay_estimate_reason,
        pay_range_confidence: pay.pay_range_confidence,
        pay_range_fit:
          pay.pay_range_fit ||
          derivePayRangeFit({
            billRate: data.c2c_bill_rate,
            payMin: pay.recommended_w2_pay_min,
            payMax: pay.recommended_w2_pay_max,
          }),
        market_rate_warning: pay.market_rate_warning,
        fillability_score: pay.fillability_score,
        fillability_label: pay.fillability_label,
        fillability_reason: pay.fillability_reason,
        suggested_risk_classification: pay.suggested_risk_classification,
      };

      await db
        .update(requisitionSourceRows)
        .set({ confirmedJson: enriched })
        .where(eq(requisitionSourceRows.id, row.id));
    }
  } catch (err) {
    console.error("Pay analysis failed, using bill-rate estimates:", err);
    for (const row of rows) {
      const data = (row.confirmedJson || row.extractedJson) as ExtractedRequisition;
      if (!data.requisition_id || !data.c2c_bill_rate) continue;
      const effectiveRate = data.c2c_bill_rate * 0.98;
      const payMid = Math.round(effectiveRate * 0.55);
      const payMin = payMid - 1;
      const payMax = payMid + 1;
      const enriched = {
        ...data,
        recommended_w2_pay_min: payMin,
        recommended_w2_pay_max: payMax,
        pay_estimate_reason:
          "Estimated from bill rate (Claude unavailable). Leading with candidate pay viability.",
        pay_range_confidence: "Low" as const,
        pay_range_fit: derivePayRangeFit({
          billRate: data.c2c_bill_rate,
          payMin,
          payMax,
          analysisFailed: true,
        }),
        fillability_score: 70,
        fillability_label: "Moderate" as const,
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
  let analysisRecordsReused = 0;

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
      fillability_score?: number | null;
      pay_estimate_reason?: string | null;
      market_rate_warning?: string | null;
      pay_range_fit?: PayRangeFit | null;
      pay_range_confidence?: "High" | "Medium" | "Low" | null;
      fillability_reason?: string | null;
    };

    // Calculate pay midpoint
    const payMin = analyzedRow.recommended_w2_pay_min || 0;
    const payMax = analyzedRow.recommended_w2_pay_max || 0;
    const payMidpoint = (payMin + payMax) / 2;
    const payRangeFit: PayRangeFit =
      analyzedRow.pay_range_fit ||
      derivePayRangeFit({
        billRate: parsePayNumber(row.c2c_bill_rate),
        payMin: payMin || null,
        payMax: payMax || null,
        missingRequired: !row.c2c_bill_rate || !payMin || !payMax,
      });
    const payEstimateReason =
      analyzedRow.pay_estimate_reason ||
      buildPayFirstExplanation({
        payMin: payMin || null,
        payMax: payMax || null,
        payRangeFit,
        fillabilityLabel: getFillabilityLabel(analyzedRow.fillability_score || 50),
        submissionCount: row.submissions,
        marketRateWarning: analyzedRow.market_rate_warning,
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

    // Calculate financials
    let financials;
    let requiresHealthcareReview = false;
    
    try {
      financials = calculateFinancials({
        displayedVendorRate: new Decimal(
          row.c2c_bill_rate_normalized || row.c2c_bill_rate || 0
        ),
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
          displayedVendorRate: new Decimal(
            row.c2c_bill_rate_normalized || row.c2c_bill_rate || 0
          ),
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
      const billChanged =
        (row.c2c_bill_rate_normalized || row.c2c_bill_rate?.toString() || null) !==
        existingReq.displayedVendorRate;
      const titleChanged = (row.job_title || null) !== existingReq.jobTitle;
      const submissionsChanged =
        (row.submissions ?? null) !== (existingReq.submissionCount ?? null);
      const changed = billChanged || titleChanged || submissionsChanged;

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
          dataQualityNotes: row.data_quality_notes || [],
          lastSeenAt: now,
          lastAnalyzedAt: now,
          isNewToday: false,
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
      const recommendation = getRecommendationLabel(scores.opportunityScore);
      
      await db
        .insert(requisitionAnalysisResults)
        .values({
          id: uuidv4(),
          tenantId,
          requisitionId: reqRecord.id,
          batchId,
          recommendedPayMin: payMin.toString(),
          recommendedPayMax: payMax.toString(),
          payMidpoint: payMidpoint.toString(),
          selectedPayRate: payMidpoint.toString(),
          payScenario: "midpoint",
          payEstimateReason: payEstimateReason,
          payRangeConfidence: analyzedRow.pay_range_confidence || "Medium",
          payRangeFit,
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
          calculatedRecommendation: recommendation,
          finalRecommendation: recommendation,
          requiresManualReview: requiresHealthcareReview,
        })
        .onConflictDoUpdate({
          target: [requisitionAnalysisResults.requisitionId],
          set: {
            batchId,
            recommendedPayMin: payMin.toString(),
            recommendedPayMax: payMax.toString(),
            payMidpoint: payMidpoint.toString(),
            selectedPayRate: payMidpoint.toString(),
            payEstimateReason: payEstimateReason,
            payRangeConfidence: analyzedRow.pay_range_confidence || "Medium",
            payRangeFit,
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
            calculatedRecommendation: recommendation,
            finalRecommendation: recommendation,
            requiresManualReview: requiresHealthcareReview,
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
        recommendedPayMin: payMin.toString(),
        recommendedPayMax: payMax.toString(),
        payMidpoint: payMidpoint.toString(),
        selectedPayRate: payMidpoint.toString(),
        payScenario: "midpoint",
        payEstimateReason: payEstimateReason,
        payRangeConfidence: analyzedRow.pay_range_confidence || "Medium",
        payRangeFit,
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
        rank: 0,
        calculatedRecommendation: recommendation,
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
        requiresManualReview: requiresHealthcareReview,
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
