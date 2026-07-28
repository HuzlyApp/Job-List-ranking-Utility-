import * as XLSX from "xlsx";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_IMAGE_DIMENSION = 8000;

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".xls", ".csv"];
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "application/octet-stream",
]);

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  category?: "image" | "spreadsheet";
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function validateUploadFile(
  filename: string,
  mimeType: string,
  size: number,
  buffer: Buffer | Uint8Array
): FileValidationResult {
  if (size === 0) {
    return { valid: false, error: "This file is empty." };
  }

  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: "The image is too large." };
  }

  const ext = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: "This file type is not supported." };
  }

  const normalizedMime = mimeType || "application/octet-stream";
  const mimeOk =
    ALLOWED_MIMES.has(normalizedMime) ||
    (ext === ".csv" && normalizedMime.startsWith("text/")) ||
    (ext === ".xlsx" && normalizedMime.includes("spreadsheet"));

  if (!mimeOk && normalizedMime !== "application/octet-stream") {
    return { valid: false, error: "This file type is not supported." };
  }

  if ([".xlsx", ".xls"].includes(ext)) {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer", bookVBA: false });
      if (!workbook.SheetNames.length) {
        return { valid: false, error: "The workbook could not be opened." };
      }
    } catch {
      return { valid: false, error: "The workbook could not be opened." };
    }
  }

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    if (buffer.length < 12) {
      return { valid: false, error: "Unsupported image format." };
    }
    const category = "image" as const;
    return { valid: true, mimeType: normalizedMime, category };
  }

  return {
    valid: true,
    mimeType: ext === ".csv" ? "text/csv" : normalizedMime,
    category: "spreadsheet",
  };
}

export { MAX_FILE_SIZE, MAX_IMAGE_DIMENSION };
