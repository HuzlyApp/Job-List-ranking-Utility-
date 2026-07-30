import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  financialAssumptionSets,
  scoringWeights,
  mspPrograms,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ensureSeedData, DEFAULT_TENANT_ID } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

/** GET /api/config — MSP programs with active assumptions and score weights */
export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;
    const mspProgramId = searchParams.get("mspProgramId");

    const programs = await db
      .select()
      .from(mspPrograms)
      .where(eq(mspPrograms.tenantId, tenantId));

    const programIds = mspProgramId
      ? programs.filter((p) => p.id === mspProgramId).map((p) => p.id)
      : programs.map((p) => p.id);

    const assumptions = [];
    const weights = [];

    for (const programId of programIds) {
      const [assumption] = await db
        .select()
        .from(financialAssumptionSets)
        .where(
          and(
            eq(financialAssumptionSets.tenantId, tenantId),
            eq(financialAssumptionSets.mspProgramId, programId),
            eq(financialAssumptionSets.isActive, true)
          )
        )
        .orderBy(desc(financialAssumptionSets.version))
        .limit(1);

      const [weight] = await db
        .select()
        .from(scoringWeights)
        .where(
          and(
            eq(scoringWeights.tenantId, tenantId),
            eq(scoringWeights.mspProgramId, programId),
            eq(scoringWeights.isActive, true)
          )
        )
        .orderBy(desc(scoringWeights.version))
        .limit(1);

      if (assumption) assumptions.push(assumption);
      if (weight) weights.push(weight);
    }

    return NextResponse.json({ programs, assumptions, weights });
  } catch (error) {
    console.error("Error fetching config:", error);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}
