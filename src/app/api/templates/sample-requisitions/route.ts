import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const SAMPLE_FILENAME = "sample-requisition-import.csv";

/**
 * GET /api/templates/sample-requisitions
 * Downloads a CSV template matching the import column layout.
 */
export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "templates",
      SAMPLE_FILENAME
    );
    const content = await readFile(filePath);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${SAMPLE_FILENAME}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving sample template:", error);
    return NextResponse.json(
      { error: "Sample template not available" },
      { status: 404 }
    );
  }
}
