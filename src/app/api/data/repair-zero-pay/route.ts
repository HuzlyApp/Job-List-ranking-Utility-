import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  repairInvalidZeroPayRecords,
  countInvalidZeroPayRecords,
} from "@/lib/repair-zero-pay";

const bodySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

/**
 * POST /api/data/repair-zero-pay
 * Safely nulls invalid zero pay fields and clears inflated financials.
 * Does not invent replacement pay — re-run batch finalize to reanalyze with Grok.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId } = bodySchema.parse(body);

    const before = await countInvalidZeroPayRecords(tenantId);
    const result = await repairInvalidZeroPayRecords(tenantId);
    const after = await countInvalidZeroPayRecords(tenantId);

    return NextResponse.json({
      success: true,
      before,
      after,
      result,
      nextStep:
        "Re-run pay analysis by finalizing the affected import batch (action: finalize). " +
        "Grok will reanalyze from source rows; null pay will no longer be coerced to $0.",
    });
  } catch (error) {
    console.error("repair-zero-pay failed:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Repair failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const count = await countInvalidZeroPayRecords();
    return NextResponse.json({ invalidZeroPayCount: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
