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
} from "@/lib/extraction-service";

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
  try {
    const { id: batchId } = await params;
    const body = await request.json();
    const validated = processSchema.parse(body);

    if (validated.action === "extract") {
      const result = await processBatchExtraction(
        batchId,
        validated.tenantId,
        validated.aiProvider
      );
      return NextResponse.json({ result });
    }

    if (validated.action === "get_status") {
      const status = await getBatchStatus(batchId, validated.tenantId);
      return NextResponse.json({ status });
    }

    if (validated.action === "get_review") {
      const review = await getReviewRows(batchId, validated.tenantId);
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to process batch";
    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : message === "Batch not found" || message === "Row not found"
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
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

    await updateSourceRow(rowId, tenantId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json({ error: "Failed to update row" }, { status: 500 });
  }
}
