import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  processBatchExtraction,
  finalizeBatch,
  getBatchStatus,
  getReviewRows,
  updateSourceRow,
  confirmReviewRows,
  runPayAnalysis,
  markBatchFailed,
} from "@/lib/extraction-service";
import { sanitizeDbError, withDbRetry } from "@/db";

export const maxDuration = 300;

const MUTATING_ACTIONS = new Set([
  "extract",
  "finalize",
  "pay_analysis",
]);

const processSchema = z.object({
  action: z.enum([
    "extract",
    "finalize",
    "get_status",
    "get_review",
    "confirm_review",
    "pay_analysis",
  ]),
  tenantId: z.string().uuid(),
  mspProgramId: z.string().uuid().optional(),
  aiProvider: z.enum(["grok", "claude"]).default("grok"),
  assumptions: z
    .object({
      ficaPercent: z.number().default(7.65),
      futaSutaHourly: z.number().default(0.45),
      standardWorkersCompHourly: z.number().default(0.30),
      highRiskWorkersCompHourly: z.number().default(0.60),
      healthcareWorkersCompHourly: z.number().nullable().default(null),
      payrollProcessingHourly: z.number().default(0.25),
      complianceHourly: z.number().default(0.20),
      insuranceHourly: z.number().default(0.25),
      recruitingHourly: z.number().default(1.25),
      overheadHourly: z.number().default(0.75),
      benefitsHourly: z.number().default(0.00),
      ptoHourly: z.number().default(0.00),
      otherHourlyCosts: z.number().default(0.00),
    })
    .optional(),
  weights: z
    .object({
      competitionWeight: z.number().default(30),
      profitabilityWeight: z.number().default(25),
      fillabilityWeight: z.number().default(20),
      billRateWeight: z.number().default(15),
      durationWeight: z.number().default(10),
    })
    .optional(),
});

// POST /api/batches/[id] - Process batch actions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let batchId = "";
  let action: string | undefined;
  try {
    ({ id: batchId } = await params);
    const body = await request.json();
    const validated = processSchema.parse(body);
    action = validated.action;

    if (validated.action === "extract") {
      const result = await processBatchExtraction(
        batchId,
        validated.tenantId,
        validated.aiProvider
      );
      return NextResponse.json({ result });
    }

    if (validated.action === "get_status") {
      const status = await withDbRetry(
        () => getBatchStatus(batchId, validated.tenantId),
        { label: "get_status" }
      );
      return NextResponse.json({ status });
    }

    if (validated.action === "get_review") {
      const review = await withDbRetry(
        () => getReviewRows(batchId, validated.tenantId),
        { label: "get_review" }
      );
      return NextResponse.json(review);
    }

    if (validated.action === "confirm_review") {
      await confirmReviewRows(batchId, validated.tenantId);
      return NextResponse.json({ success: true });
    }

    if (validated.action === "pay_analysis") {
      await runPayAnalysis(batchId, validated.tenantId);
      return NextResponse.json({ success: true });
    }

    if (validated.action === "finalize") {
      if (!validated.mspProgramId || !validated.assumptions || !validated.weights) {
        return NextResponse.json(
          { error: "mspProgramId, assumptions, and weights are required" },
          { status: 400 }
        );
      }
      await runPayAnalysis(batchId, validated.tenantId);
      const summary = await finalizeBatch(
        batchId,
        validated.tenantId,
        validated.mspProgramId,
        validated.assumptions,
        validated.weights
      );
      if (summary.uniqueRequisitionCount === 0) {
        await markBatchFailed(
          batchId,
          "ZERO_FINALIZED",
          "No requisitions were finalized"
        );
        return NextResponse.json(
          {
            success: false,
            error: "No requisitions were finalized",
            summary,
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ success: true, summary });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error processing batch:", error);
    const safeMessage = sanitizeDbError(error);

    // Never mark the batch failed for read-only polling — that permanently
    // stuck imports after transient Neon blips during get_status.
    if (batchId && action && MUTATING_ACTIONS.has(action)) {
      try {
        await markBatchFailed(batchId, "PROCESSING_ERROR", safeMessage);
      } catch (markErr) {
        console.error("Failed to mark batch failed:", markErr);
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : safeMessage === "Batch not found" || safeMessage === "Row not found"
          ? 404
          : 500;
    return NextResponse.json({ error: safeMessage }, { status: statusCode });
  }
}

// PATCH /api/batches/[id] - Update extracted rows during review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await request.json();
    const { rowId, tenantId, updates } = body;

    if (!rowId || !tenantId) {
      return NextResponse.json({ error: "rowId and tenantId required" }, { status: 400 });
    }

    await withDbRetry(() => updateSourceRow(rowId, tenantId, updates), {
      label: "update_source_row",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json(
      { error: sanitizeDbError(error) },
      { status: 500 }
    );
  }
}
