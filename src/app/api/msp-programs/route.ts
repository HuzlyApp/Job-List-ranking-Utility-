import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mspPrograms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeedData, DEFAULT_TENANT_ID } from "@/lib/seed-data";

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;

    const programs = await db
      .select()
      .from(mspPrograms)
      .where(eq(mspPrograms.tenantId, tenantId));

    return NextResponse.json({ programs });
  } catch (error) {
    console.error("Error fetching MSP programs:", error);
    return NextResponse.json({ error: "Failed to fetch programs" }, { status: 500 });
  }
}
