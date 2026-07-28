import { NextResponse } from "next/server";
import { ensureSeedData } from "@/lib/seed-data";

export async function GET() {
  try {
    const seed = await ensureSeedData();
    return NextResponse.json({ ok: true, ...seed });
  } catch (error) {
    console.error("Setup failed:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
