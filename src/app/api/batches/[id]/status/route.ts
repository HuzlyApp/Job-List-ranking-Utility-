import { NextRequest, NextResponse } from "next/server";
import { getAnalysisStatusPayload } from "@/lib/extraction-service";
import { sanitizeDbError, withDbRetry } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/batches/:batchId/status?tenantId=...
 * Persisted analysis progress for polling UIs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: batchId } = await params;
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId is required" },
        { status: 400 }
      );
    }

    const analysis = await withDbRetry(
      () => getAnalysisStatusPayload(batchId, tenantId),
      { label: "batch_status_get" }
    );

    return NextResponse.json(analysis, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("Error reading batch status:", error);
    const safeMessage = sanitizeDbError(error);
    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : safeMessage === "Batch not found"
          ? 404
          : 500;
    return NextResponse.json({ error: safeMessage }, { status: statusCode });
  }
}
