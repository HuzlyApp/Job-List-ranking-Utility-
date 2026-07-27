import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  requisitions,
  requisitionAnalysisResults,
  requisitionOverrides,
  requisitionSnapshots,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const overrideSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  fieldName: z.string(),
  previousValue: z.any(),
  newValue: z.any(),
  reason: z.string().min(1),
});

// GET /api/requisitions/[id] - Get requisition details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    // Get requisition
    const [requisition] = await db
      .select()
      .from(requisitions)
      .where(and(eq(requisitions.id, id), eq(requisitions.tenantId, tenantId)));

    if (!requisition) {
      return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
    }

    // Get analysis result
    const [analysis] = await db
      .select()
      .from(requisitionAnalysisResults)
      .where(eq(requisitionAnalysisResults.requisitionId, id));

    // Get overrides
    const overrides = await db
      .select()
      .from(requisitionOverrides)
      .where(eq(requisitionOverrides.requisitionId, id))
      .orderBy(desc(requisitionOverrides.createdAt));

    // Get snapshots (history)
    const snapshots = await db
      .select()
      .from(requisitionSnapshots)
      .where(eq(requisitionSnapshots.requisitionId, id))
      .orderBy(desc(requisitionSnapshots.createdAt));

    return NextResponse.json({
      requisition,
      analysis,
      overrides,
      snapshots,
    });
  } catch (error) {
    console.error("Error fetching requisition:", error);
    return NextResponse.json(
      { error: "Failed to fetch requisition" },
      { status: 500 }
    );
  }
}

// PATCH /api/requisitions/[id] - Update requisition
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { tenantId, updates } = body;

    await db
      .update(requisitions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(requisitions.id, id), eq(requisitions.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating requisition:", error);
    return NextResponse.json(
      { error: "Failed to update requisition" },
      { status: 500 }
    );
  }
}

// POST /api/requisitions/[id]/override - Create override
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requisitionId } = await params;
    const body = await request.json();
    const validated = overrideSchema.parse({ ...body, requisitionId });

    await db.insert(requisitionOverrides).values({
      id: uuidv4(),
      tenantId: validated.tenantId,
      requisitionId,
      fieldName: validated.fieldName,
      previousValue: validated.previousValue,
      newValue: validated.newValue,
      reason: validated.reason,
      createdBy: validated.userId,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating override:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create override" },
      { status: 500 }
    );
  }
}
