import { NextResponse } from "next/server";
import { db } from "@/db";
import { requisitions } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Returns only generic connectivity status.
 * Does not expose connection strings, hosts, or credentials.
 */
export async function GET() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(requisitions);

    return NextResponse.json({
      status: "ok",
      database: "connected",
      requisitionsTable: "present",
      checkedAt: new Date().toISOString(),
      // Count is safe/non-sensitive operational metadata for operators
      requisitionCount: Number(count) || 0,
    });
  } catch (error) {
    console.error("[health.db]", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
