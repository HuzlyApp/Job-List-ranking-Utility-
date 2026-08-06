import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
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
  tryClaimAnalysisWorker,
  getAnalysisStatusPayload,
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
      const analysis = await withDbRetry(
        () => getAnalysisStatusPayload(batchId, validated.tenantId),
        { label: "get_analysis_status" }
      );
      return NextResponse.json(
        { status, analysis },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
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
      const claim = await tryClaimAnalysisWorker(batchId, validated.tenantId);
      if (!claim.claimed) {
        if (claim.reason === "already_running") {
          return NextResponse.json({ success: true, alreadyRunning: true });
        }
        return NextResponse.json(
          { error: `Cannot start analysis (${claim.reason})` },
          { status: claim.reason === "not_found" ? 404 : 409 }
        );
      }
      after(async () => {
        try {
          await runPayAnalysis(batchId, validated.tenantId);
        } catch (err) {
          console.error("Background pay analysis failed:", err);
          await markBatchFailed(
            batchId,
            "PAY_ANALYSIS_ERROR",
            sanitizeDbError(err)
          );
        }
      });
      return NextResponse.json({ success: true, started: true });
    }

    if (validated.action === "finalize") {
      if (!validated.mspProgramId || !validated.assumptions || !validated.weights) {
        return NextResponse.json(
          { error: "mspProgramId, assumptions, and weights are required" },
          { status: 400 }
        );
      }

      const claim = await tryClaimAnalysisWorker(batchId, validated.tenantId);
      if (!claim.claimed) {
        if (claim.reason === "already_running") {
          return NextResponse.json({
            success: true,
            started: false,
            alreadyRunning: true,
          });
        }
        if (claim.reason === "terminal") {
          const analysis = await getAnalysisStatusPayload(
            batchId,
            validated.tenantId
          );
          return NextResponse.json({
            success: true,
            alreadyComplete: true,
            summary: analysis.completionSummary,
          });
        }
        return NextResponse.json(
          { error: `Cannot start analysis (${claim.reason})` },
          { status: claim.reason === "not_found" ? 404 : 409 }
        );
      }

      const mspProgramId = validated.mspProgramId;
      const assumptions = validated.assumptions;
      const weights = validated.weights;
      const tenantId = validated.tenantId;

      // Durable relative to the browser: work continues after the response via after().
      after(async () => {
        try {
          await runPayAnalysis(batchId, tenantId);
          const summary = await finalizeBatch(
            batchId,
            tenantId,
            mspProgramId,
            assumptions,
            weights
          );
          if (summary.uniqueRequisitionCount === 0) {
            await markBatchFailed(
              batchId,
              "ZERO_FINALIZED",
              "No requisitions were finalized"
            );
          }
        } catch (err) {
          console.error("Background finalize failed:", err);
          await markBatchFailed(
            batchId,
            "PROCESSING_ERROR",
            sanitizeDbError(err)
          );
        }
      });

      return NextResponse.json({ success: true, started: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error processing batch:", error);
    const safeMessage = sanitizeDbError(error);

    // Never mark the batch failed for read-only polling — that permanently
    // stuck imports after transient Neon blips during get_status.
    // Also skip for finalize/pay_analysis once work was handed to after().
    if (
      batchId &&
      action &&
      MUTATING_ACTIONS.has(action) &&
      action !== "finalize" &&
      action !== "pay_analysis"
    ) {
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
