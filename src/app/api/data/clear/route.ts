import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CLEAR_SCOPES,
  clearTenantData,
  resolveEffectiveScopes,
  type ClearScope,
} from "@/lib/clear-data";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  scopes: z
    .array(z.enum(CLEAR_SCOPES))
    .min(1, "Select at least one delete option"),
  confirm: z.literal(true),
});

/**
 * POST /api/data/clear
 * Deletes tenant operational data by scope.
 * Does not delete seed config (tenant, users, MSP programs, assumptions, weights).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = bodySchema.parse(body);
    const scopes = resolveEffectiveScopes(validated.scopes as ClearScope[]);

    const result = await clearTenantData(validated.tenantId, scopes);

    const totalDeleted = Object.values(result.deleted).reduce(
      (sum, n) => sum + n,
      0
    );

    return NextResponse.json({
      success: true,
      scopes: result.scopes,
      deleted: result.deleted,
      totalDeleted,
      message:
        totalDeleted === 0
          ? "No matching records found to delete"
          : `Deleted ${totalDeleted} records`,
    });
  } catch (error) {
    console.error("Error clearing data:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear data" },
      { status: 500 }
    );
  }
}

/** DELETE /api/data/clear?tenantId=&scopes=all|imports,requisitions */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const scopesRaw = searchParams.get("scopes") || "all";
    const confirm = searchParams.get("confirm");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }
    if (confirm !== "true") {
      return NextResponse.json(
        { error: "Pass confirm=true to delete data" },
        { status: 400 }
      );
    }

    const scopes = resolveEffectiveScopes(
      scopesRaw.split(",").map((s) => s.trim()) as ClearScope[]
    );

    const parsed = z.array(z.enum(CLEAR_SCOPES)).min(1).safeParse(scopes);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid scopes", allowed: CLEAR_SCOPES },
        { status: 400 }
      );
    }

    const result = await clearTenantData(tenantId, parsed.data);
    const totalDeleted = Object.values(result.deleted).reduce(
      (sum, n) => sum + n,
      0
    );

    return NextResponse.json({
      success: true,
      scopes: result.scopes,
      deleted: result.deleted,
      totalDeleted,
    });
  } catch (error) {
    console.error("Error clearing data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear data" },
      { status: 500 }
    );
  }
}
