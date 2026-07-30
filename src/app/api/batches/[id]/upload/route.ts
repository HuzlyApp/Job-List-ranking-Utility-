import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  uploadSourceFile,
  processBatchExtraction,
} from "@/lib/extraction-service";
import { validateUploadFile } from "@/lib/file-validation";
import { ensureSeedData } from "@/lib/seed-data";

const uploadMetaSchema = z.object({
  tenantId: z.string().uuid(),
  mspProgramId: z.string().uuid(),
  createdBy: z.string().uuid(),
  representsCompletePortalView: z.boolean().default(false),
});

// POST /api/batches/[id]/upload - Upload files and start processing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id: batchId } = await params;
    const formData = await request.formData();

    const metaRaw = formData.get("meta");
    if (!metaRaw || typeof metaRaw !== "string") {
      return NextResponse.json({ error: "Missing upload metadata" }, { status: 400 });
    }

    const meta = uploadMetaSchema.parse(JSON.parse(metaRaw));
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadResults: Array<{ filename: string; fileId: string; error?: string }> = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = validateUploadFile(file.name, file.type, file.size, buffer);

      if (!validation.valid) {
        uploadResults.push({ filename: file.name, fileId: "", error: validation.error });
        continue;
      }

      try {
        const result = await uploadSourceFile({
          batchId,
          tenantId: meta.tenantId,
          filename: file.name,
          mimeType: validation.mimeType || file.type,
          fileSize: file.size,
          content: buffer,
        });
        uploadResults.push({ filename: file.name, fileId: result.fileId });
      } catch (err) {
        uploadResults.push({
          filename: file.name,
          fileId: "",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    const successful = uploadResults.filter((r) => r.fileId);
    if (successful.length === 0) {
      return NextResponse.json(
        { error: "All files failed validation", results: uploadResults },
        { status: 400 }
      );
    }

    const onlySpreadsheets = files.every((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
    });

    if (onlySpreadsheets) {
      // CSV/XLSX parse is fast — finish before responding so the progress page
      // lands on awaiting_review instead of getting stuck mid-poll on serverless.
      try {
        await processBatchExtraction(batchId, meta.tenantId);
      } catch (err) {
        console.error("Extraction failed:", err);
        return NextResponse.json({
          batchId,
          uploaded: successful.length,
          failed: uploadResults.filter((r) => r.error).length,
          results: uploadResults,
          extractionError:
            err instanceof Error ? err.message : "We could not process this file.",
        });
      }
    } else {
      // Screenshots may need Claude — continue after the response is sent.
      after(async () => {
        try {
          await processBatchExtraction(batchId, meta.tenantId);
        } catch (err) {
          console.error("Background extraction failed:", err);
        }
      });
    }

    return NextResponse.json({
      batchId,
      uploaded: successful.length,
      failed: uploadResults.filter((r) => r.error).length,
      results: uploadResults,
    });
  } catch (error) {
    console.error("Upload error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
