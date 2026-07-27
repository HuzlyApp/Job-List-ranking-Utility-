import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  requisitionAnalysisBatches,
  requisitionSourceFiles,
  requisitionSourceRows,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  createBatch,
  uploadSourceFile,
  processBatchExtraction,
  finalizeBatch,
  getBatchStatus,
} from "@/lib/extraction-service";
import { v4 as uuidv4 } from "uuid";

const createBatchSchema = z.object({
  tenantId: z.string().uuid(),
  mspProgramId: z.string().uuid(),
  createdBy: z.string().uuid(),
  representsCompletePortalView: z.boolean().default(false),
});

// GET /api/batches - List batches for tenant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const mspProgramId = searchParams.get("mspProgramId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    let query = db
      .select()
      .from(requisitionAnalysisBatches)
      .where(eq(requisitionAnalysisBatches.tenantId, tenantId))
      .orderBy(desc(requisitionAnalysisBatches.createdAt));

    if (mspProgramId) {
      query = db
        .select()
        .from(requisitionAnalysisBatches)
        .where(
          and(
            eq(requisitionAnalysisBatches.tenantId, tenantId),
            eq(requisitionAnalysisBatches.mspProgramId, mspProgramId)
          )
        )
        .orderBy(desc(requisitionAnalysisBatches.createdAt));
    }

    const batches = await query;

    return NextResponse.json({ batches });
  } catch (error) {
    console.error("Error fetching batches:", error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}

// POST /api/batches - Create new batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createBatchSchema.parse(body);

    const batch = await createBatch({
      tenantId: validated.tenantId,
      mspProgramId: validated.mspProgramId,
      createdBy: validated.createdBy,
      representsCompletePortalView: validated.representsCompletePortalView,
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error("Error creating batch:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }
}
