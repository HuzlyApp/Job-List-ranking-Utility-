import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import type { ExtractedRequisition } from "@/types";
import { COLUMN_ALIASES, DURATION_CONVERSIONS } from "@/types";

export const CSV_READ_ERROR =
  "We could not read this CSV file. Please confirm that it is a valid CSV export.";

/** Default Randstad iLabor column layout when no header row is present. */
export const RANDSTAD_COLUMN_LAYOUT: ReadonlyArray<keyof ExtractedRequisition | null> = [
  "status",
  "requisition_id",
  "customer",
  "job_title",
  "submissions",
  "c2c_bill_rate",
  "location",
  "start_date",
  "duration",
  "number_of_positions",
  "active_submissions",
  "released_date",
  "position_type",
  null, // unused / trailing empty column
];

export const FIELD_DISPLAY_LABELS: Record<string, string> = {
  status: "Status",
  requisition_id: "Requisition ID",
  customer: "Customer",
  job_title: "Job Title",
  submissions: "Submission Count",
  c2c_bill_rate: "Bill Rate",
  location: "Location",
  start_date: "Start Date",
  duration: "Duration",
  number_of_positions: "Number of Positions",
  active_submissions: "Active Submissions",
  released_date: "Released Date",
  position_type: "Position Type",
};

export const SOURCE_COLUMN_LABELS: Record<string, string> = {
  status: "Status",
  requisition_id: "Requisition ID",
  customer: "Customer",
  job_title: "Job Title",
  submissions: "Submissions",
  c2c_bill_rate: "C2C Rate",
  location: "Location",
  start_date: "Start Date",
  duration: "Duration",
  number_of_positions: "Positions",
  active_submissions: "Active",
  released_date: "Released",
  position_type: "Type",
};

export type CsvEncoding = "UTF-8" | "UTF-8-BOM" | "Windows-1252" | "ISO-8859-1";

export interface ColumnMappingEntry {
  sourceLabel: string;
  field: string;
  targetLabel: string;
  columnIndex: number;
}

export interface ImportParseSummary {
  fileName: string;
  encoding: CsvEncoding | string;
  headerMode: "detected" | "positional_randstad";
  mappingConfidence: "high" | "low";
  rowsDetected: number;
  validRows: number;
  rowsRequiringReview: number;
  duplicateRequisitionIds: number;
  missingRequisitionIds: number;
  missingBillRates: number;
  dateParsingWarnings: number;
  leadingEmptyColumnShifted: boolean;
  trailingEmptyColumnsIgnored: number;
  columnMapping: ColumnMappingEntry[];
}

export interface ParsedSpreadsheet {
  sheetName: string;
  rows: ExtractedRequisition[];
  headers: string[];
  encoding?: CsvEncoding | string;
  summary?: ImportParseSummary;
  columnMapping?: ColumnMappingEntry[];
  mappingConfidence?: "high" | "low";
  headerMode?: "detected" | "positional_randstad";
}

export class CsvReadError extends Error {
  constructor(message: string = CSV_READ_ERROR) {
    super(message);
    this.name = "CsvReadError";
  }
}

const STATUS_VALUES = new Set([
  "open",
  "closed",
  "filled",
  "on hold",
  "hold",
  "cancelled",
  "canceled",
  "draft",
  "pending",
]);

const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const CURRENCY_RE = /^\$?\s*[\d,]+(?:\.\d+)?\s*$/;
const DURATION_RE = /^\d+(?:\.\d+)?\s*(months?|weeks?|days?|years?)$/i;
const NUMERIC_ID_RE = /^\d+(?:\.0+)?$/;

/**
 * Normalize column header to standard field name
 */
export function normalizeColumnHeader(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  if (!normalized || normalized.startsWith("unnamed")) {
    return null;
  }

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return field;
    }
  }

  return null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isBlank(value: unknown): boolean {
  return cellText(value) === "";
}

/**
 * Detect whether a row looks like requisition data (not column headers).
 */
export function looksLikeRequisitionDataRow(row: unknown[]): boolean {
  if (!Array.isArray(row) || row.length === 0) return false;

  const cells = row.map(cellText).filter(Boolean);
  if (cells.length < 4) return false;

  let score = 0;

  for (const cell of row) {
    const text = cellText(cell);
    if (!text) continue;

    if (STATUS_VALUES.has(text.toLowerCase())) score += 2;
    if (NUMERIC_ID_RE.test(text) && text.replace(/\.0+$/, "").length >= 4) score += 2;
    if (CURRENCY_RE.test(text) && text.includes("$")) score += 2;
    if (US_DATE_RE.test(text)) score += 1;
    if (DURATION_RE.test(text)) score += 1;
    if (/,\s*[A-Z]{2}$/.test(text) || /\b[A-Z]{2}\b/.test(text) && text.includes(",")) score += 1;
    if (/contract|permanent|temp/i.test(text)) score += 1;
  }

  // Headers typically map to aliases; data rows do not.
  const aliasMatches = row.filter(
    (cell) => typeof cell === "string" && normalizeColumnHeader(cell) !== null
  ).length;

  if (aliasMatches >= 3) return false;
  return score >= 4;
}

/**
 * Detect header row in spreadsheet. Returns -1 when no valid header exists
 * (first row is requisition data).
 */
export function detectHeaderRow(data: unknown[][]): number {
  let bestRow = -1;
  let maxMatches = 0;

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    if (looksLikeRequisitionDataRow(row)) {
      continue;
    }

    const matches = row.filter((cell) => {
      if (typeof cell !== "string" && typeof cell !== "number") return false;
      return normalizeColumnHeader(String(cell)) !== null;
    }).length;

    if (matches > maxMatches) {
      maxMatches = matches;
      bestRow = i;
    }
  }

  // Require at least 3 recognizable headers; otherwise treat as headerless.
  if (maxMatches < 3) {
    return -1;
  }

  return bestRow;
}

/**
 * Detect when most rows have a leading empty column before status + req ID.
 */
export function detectLeadingEmptyColumn(rows: unknown[][]): boolean {
  if (rows.length === 0) return false;

  let emptyFirst = 0;
  let statusSecond = 0;
  let idThird = 0;

  for (const row of rows) {
    if (!Array.isArray(row) || row.every(isBlank)) continue;
    if (isBlank(row[0])) emptyFirst++;
    const second = cellText(row[1]).toLowerCase();
    if (STATUS_VALUES.has(second)) statusSecond++;
    const third = cellText(row[2]);
    if (NUMERIC_ID_RE.test(third)) idThird++;
  }

  const sample = Math.max(1, rows.filter((r) => Array.isArray(r) && !r.every(isBlank)).length);
  return (
    emptyFirst / sample >= 0.6 &&
    statusSecond / sample >= 0.5 &&
    idThird / sample >= 0.5
  );
}

/**
 * Shift row values left when a leading empty column was detected.
 * Does not shift rows that are already correctly aligned (status in col 0).
 */
export function shiftLeadingEmptyColumn(row: unknown[]): unknown[] {
  if (!Array.isArray(row) || row.length === 0) return row;
  if (!isBlank(row[0])) return row;

  const second = cellText(row[1]).toLowerCase();
  const third = cellText(row[2]);
  if (STATUS_VALUES.has(second) && NUMERIC_ID_RE.test(third)) {
    return row.slice(1);
  }
  return row;
}

/**
 * Count trailing columns that are empty for nearly all rows.
 */
export function countTrailingEmptyColumns(rows: unknown[][]): number {
  if (rows.length === 0) return 0;
  const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  let trailing = 0;

  for (let col = maxLen - 1; col >= 0; col--) {
    const nonEmpty = rows.filter((r) => Array.isArray(r) && !isBlank(r[col])).length;
    if (nonEmpty / rows.length <= 0.05) {
      trailing++;
    } else {
      break;
    }
  }
  return trailing;
}

/**
 * Normalize currency using Decimal.js (not float math as authority).
 * Returns numeric for schema compatibility plus original/normalized strings.
 */
export function normalizeCurrency(value: unknown): {
  original: string | null;
  normalized: string | null;
  numeric: number | null;
} {
  if (value === null || value === undefined || value === "") {
    return { original: null, normalized: null, numeric: null };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Decimal(value);
    return {
      original: String(value),
      normalized: d.toFixed(2),
      numeric: Number(d.toFixed(2)),
    };
  }

  const original = String(value).trim();
  const cleaned = original.replace(/\$/g, "").replace(/,/g, "").trim();
  if (!cleaned) {
    return { original, normalized: null, numeric: null };
  }

  try {
    const d = new Decimal(cleaned);
    if (!d.isFinite()) {
      return { original, normalized: null, numeric: null };
    }
    return {
      original,
      normalized: d.toFixed(2),
      numeric: Number(d.toFixed(2)),
    };
  } catch {
    return { original, normalized: null, numeric: null };
  }
}

/**
 * Normalize integer-like counts and IDs (strips trailing .0).
 */
export function normalizeIntegerValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value);
  }
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "");
  if (/^-?\d+(?:\.0+)?$/.test(cleaned)) {
    return parseInt(cleaned.replace(/\.0+$/, ""), 10);
  }
  const match = cleaned.match(/^-?\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Normalize requisition ID — never show trailing .0; blank → null.
 */
export function normalizeRequisitionId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(Math.trunc(value));
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+\.0+$/.test(text)) {
    return text.replace(/\.0+$/, "");
  }
  return text;
}

/**
 * Parse US-format M/D/YYYY dates without month/day swapping.
 */
export function normalizeUsDate(value: unknown): {
  original: string | null;
  normalized: string | null;
  warning: string | null;
} {
  if (value === null || value === undefined || value === "") {
    return { original: null, normalized: null, warning: null };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return { original: value.toISOString(), normalized: `${y}-${m}-${d}`, warning: null };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return {
        original: String(value),
        normalized: `${parsed.y}-${m}-${d}`,
        warning: null,
      };
    }
  }

  const original = String(value).trim();
  const us = original.match(US_DATE_RE);
  if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    const year = parseInt(us[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return {
        original,
        normalized: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        warning: null,
      };
    }
  }

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(original)) {
    return { original, normalized: original.slice(0, 10), warning: null };
  }

  return {
    original,
    normalized: null,
    warning: `Could not parse date "${original}" — please correct during review.`,
  };
}

/**
 * Normalize duration text and assignment weeks via configured conversions.
 */
export function normalizeDuration(value: unknown): {
  original: string | null;
  weeks: number | null;
} {
  if (value === null || value === undefined || value === "") {
    return { original: null, weeks: null };
  }

  const original = String(value).trim();
  if (!original) return { original: null, weeks: null };

  const lower = original.toLowerCase();
  for (const [pattern, weeks] of Object.entries(DURATION_CONVERSIONS)) {
    if (lower.includes(pattern.toLowerCase())) {
      return { original, weeks };
    }
  }

  const monthMatch = lower.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthMatch) {
    return { original, weeks: Math.round(parseFloat(monthMatch[1]) * 4.333 * 10) / 10 };
  }
  const weekMatch = lower.match(/(\d+(?:\.\d+)?)\s*weeks?/);
  if (weekMatch) {
    return { original, weeks: parseFloat(weekMatch[1]) };
  }
  const dayMatch = lower.match(/(\d+)\s*days?/);
  if (dayMatch) {
    return { original, weeks: Math.round((parseInt(dayMatch[1], 10) / 7) * 10) / 10 };
  }

  return { original, weeks: null };
}

/**
 * Parse value based on expected type (legacy helper + enhanced normalizers).
 */
export function parseValue(value: unknown, field: string): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  switch (field) {
    case "submissions":
    case "number_of_positions":
    case "active_submissions":
      return normalizeIntegerValue(value);

    case "requisition_id":
      return normalizeRequisitionId(value);

    case "c2c_bill_rate":
      return normalizeCurrency(value).numeric;

    case "start_date":
    case "released_date":
      return normalizeUsDate(value).normalized;

    case "duration": {
      const d = normalizeDuration(value);
      return d.original;
    }

    default:
      return String(value).trim() || null;
  }
}

function emptyRecord(
  sourceKey: string
): Partial<ExtractedRequisition> & { data_quality_notes: string[] } {
  return {
    source_record_key: sourceKey,
    status: null,
    requisition_id: null,
    customer: null,
    job_title: null,
    submissions: null,
    c2c_bill_rate: null,
    location: null,
    start_date: null,
    duration: null,
    number_of_positions: null,
    active_submissions: null,
    released_date: null,
    position_type: null,
    remote_or_onsite: "Unknown",
    source_confidence: "High",
    data_quality_notes: [],
    source_c2c_bill_rate: null,
    c2c_bill_rate_normalized: null,
    source_start_date: null,
    source_released_date: null,
    source_duration: null,
    normalized_duration_weeks: null,
  };
}

function applyFieldValue(
  record: Partial<ExtractedRequisition> & { data_quality_notes: string[] },
  field: string,
  value: unknown
): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  switch (field) {
    case "c2c_bill_rate": {
      const currency = normalizeCurrency(value);
      record.source_c2c_bill_rate = currency.original;
      record.c2c_bill_rate_normalized = currency.normalized;
      record.c2c_bill_rate = currency.numeric;
      if (currency.original && currency.numeric === null) {
        record.data_quality_notes.push(`Could not parse bill rate "${currency.original}".`);
        record.source_confidence = "Medium";
      }
      break;
    }
    case "start_date":
    case "released_date": {
      const date = normalizeUsDate(value);
      if (field === "start_date") {
        record.source_start_date = date.original;
        record.start_date = date.normalized;
      } else {
        record.source_released_date = date.original;
        record.released_date = date.normalized;
      }
      if (date.warning) {
        record.data_quality_notes.push(date.warning);
        record.source_confidence = "Medium";
      }
      break;
    }
    case "duration": {
      const duration = normalizeDuration(value);
      record.duration = duration.original;
      record.source_duration = duration.original;
      record.normalized_duration_weeks = duration.weeks;
      break;
    }
    case "requisition_id":
      record.requisition_id = normalizeRequisitionId(value);
      break;
    case "submissions":
    case "number_of_positions":
    case "active_submissions":
      (record as Record<string, unknown>)[field] = normalizeIntegerValue(value);
      break;
    default:
      (record as Record<string, unknown>)[field] = String(value).trim() || null;
  }
}

function buildColumnMapping(
  fieldMapping: Record<number, string>
): ColumnMappingEntry[] {
  return Object.entries(fieldMapping)
    .map(([index, field]) => ({
      columnIndex: parseInt(index, 10),
      field,
      sourceLabel: SOURCE_COLUMN_LABELS[field] || field,
      targetLabel: FIELD_DISPLAY_LABELS[field] || field,
    }))
    .sort((a, b) => a.columnIndex - b.columnIndex);
}

function buildSummary(
  fileName: string,
  encoding: string,
  headerMode: "detected" | "positional_randstad",
  mappingConfidence: "high" | "low",
  rows: ExtractedRequisition[],
  columnMapping: ColumnMappingEntry[],
  leadingEmptyColumnShifted: boolean,
  trailingEmptyColumnsIgnored: number
): ImportParseSummary {
  const idCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.requisition_id) {
      idCounts.set(row.requisition_id, (idCounts.get(row.requisition_id) || 0) + 1);
    }
  }

  const duplicateRequisitionIds = Array.from(idCounts.values()).filter((c) => c > 1).length;
  const missingRequisitionIds = rows.filter((r) => !r.requisition_id).length;
  const missingBillRates = rows.filter((r) => r.c2c_bill_rate === null || r.c2c_bill_rate === undefined).length;
  const dateParsingWarnings = rows.filter((r) =>
    (r.data_quality_notes || []).some((n) => n.toLowerCase().includes("date"))
  ).length;
  const rowsRequiringReview = rows.filter(
    (r) =>
      !r.requisition_id ||
      r.c2c_bill_rate === null ||
      r.c2c_bill_rate === undefined ||
      (r.data_quality_notes || []).length > 0 ||
      r.source_confidence !== "High"
  ).length;
  const validRows = rows.filter(
    (r) => r.requisition_id && r.c2c_bill_rate !== null && r.c2c_bill_rate !== undefined
  ).length;

  return {
    fileName,
    encoding,
    headerMode,
    mappingConfidence,
    rowsDetected: rows.length,
    validRows,
    rowsRequiringReview,
    duplicateRequisitionIds,
    missingRequisitionIds,
    missingBillRates,
    dateParsingWarnings,
    leadingEmptyColumnShifted,
    trailingEmptyColumnsIgnored,
    columnMapping,
  };
}

function parseRawMatrix(
  data: unknown[][],
  filename: string,
  sheetName: string,
  encoding: string = "UTF-8"
): ParsedSpreadsheet {
  if (data.length === 0) {
    return {
      sheetName,
      rows: [],
      headers: [],
      encoding,
      headerMode: "positional_randstad",
      mappingConfidence: "low",
      columnMapping: [],
      summary: buildSummary(filename, encoding, "positional_randstad", "low", [], [], false, 0),
    };
  }

  // Drop completely blank rows for shape detection, keep indices for source keys.
  const nonBlankRows = data.filter((row) => Array.isArray(row) && !row.every(isBlank));
  const leadingEmpty = detectLeadingEmptyColumn(nonBlankRows);
  const trailingEmpty = countTrailingEmptyColumns(nonBlankRows);

  const normalizedData = data.map((row) => {
    if (!Array.isArray(row)) return row;
    let next = leadingEmpty ? shiftLeadingEmptyColumn(row) : row;
    if (trailingEmpty > 0 && next.length > trailingEmpty) {
      // Keep structure but ignore trailing empties when mapping by not including them
      next = next.slice(0, Math.max(0, next.length - trailingEmpty));
    }
    return next;
  });

  const headerRow = detectHeaderRow(normalizedData);
  let fieldMapping: Record<number, string> = {};
  let headers: string[] = [];
  let dataStart = 0;
  let headerMode: "detected" | "positional_randstad" = "positional_randstad";
  let mappingConfidence: "high" | "low" = "high";

  if (headerRow >= 0) {
    headerMode = "detected";
    headers = normalizedData[headerRow].map((h) => String(h ?? "").trim());
    const detected: Record<number, string> = {};
    headers.forEach((header, index) => {
      const field = normalizeColumnHeader(header);
      if (field) {
        detected[index] = field;
      }
    });
    fieldMapping = detected;
    dataStart = headerRow + 1;
    mappingConfidence = Object.keys(fieldMapping).length >= 5 ? "high" : "low";
  } else {
    // Positional Randstad layout — first row is data.
    headerMode = "positional_randstad";
    const positional: Record<number, string> = {};
    RANDSTAD_COLUMN_LAYOUT.forEach((field, index) => {
      if (field) {
        positional[index] = field;
        headers[index] = SOURCE_COLUMN_LABELS[field] || field;
      }
    });
    fieldMapping = positional;
    dataStart = 0;
    mappingConfidence = "high";
  }

  const columnMapping = buildColumnMapping(fieldMapping);
  const rows: ExtractedRequisition[] = [];

  for (let i = dataStart; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    if (!Array.isArray(row) || row.every(isBlank)) continue;

    const record = emptyRecord(`${filename}:${sheetName}:row${i + 1}`);
    let hasData = false;

    for (const [index, field] of Object.entries(fieldMapping)) {
      const value = row[parseInt(index, 10)];
      if (value !== undefined && value !== null && value !== "") {
        hasData = true;
        applyFieldValue(record, field, value);
      }
    }

    if (hasData) {
      rows.push(record as ExtractedRequisition);
    }
  }

  const summary = buildSummary(
    filename,
    encoding,
    headerMode,
    mappingConfidence,
    rows,
    columnMapping,
    leadingEmpty,
    trailingEmpty
  );

  return {
    sheetName,
    rows,
    headers: headers.filter((h) => h && !h.toLowerCase().startsWith("unnamed")),
    encoding,
    headerMode,
    mappingConfidence,
    columnMapping,
    summary,
  };
}

/**
 * Decode CSV bytes with encoding fallbacks.
 * Order: UTF-8 → UTF-8 BOM → Windows-1252 → ISO-8859-1
 */
export function decodeCsvBuffer(buffer: Buffer | Uint8Array): {
  text: string;
  encoding: CsvEncoding;
} {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (buf.length === 0) {
    throw new CsvReadError();
  }

  // UTF-8 with BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(3));
      return { text, encoding: "UTF-8-BOM" };
    } catch {
      // fall through
    }
  }

  // Strict UTF-8
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text, encoding: "UTF-8" };
  } catch {
    // fall through
  }

  // Windows-1252
  try {
    const text = new TextDecoder("windows-1252", { fatal: true }).decode(buf);
    return { text, encoding: "Windows-1252" };
  } catch {
    // fall through
  }

  // ISO-8859-1 (latin1) — always decodes any byte sequence
  try {
    const text = new TextDecoder("iso-8859-1").decode(buf);
    return { text, encoding: "ISO-8859-1" };
  } catch {
    throw new CsvReadError();
  }
}

/**
 * Parse spreadsheet buffer (XLSX / XLS)
 */
export function parseSpreadsheet(buffer: Buffer, filename: string): ParsedSpreadsheet[] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
  });

  const results: ParsedSpreadsheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: true,
      defval: "",
      raw: true,
    }) as unknown[][];

    if (data.length === 0) continue;
    results.push(parseRawMatrix(data, filename, sheetName, "binary"));
  }

  return results;
}

/**
 * Parse CSV from a decoded string.
 */
export function parseCSV(
  content: string,
  filename: string,
  encoding: CsvEncoding | string = "UTF-8"
): ParsedSpreadsheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(content, { type: "string", raw: true });
  } catch {
    throw new CsvReadError();
  }

  const sheetName = workbook.SheetNames[0] || "Sheet1";
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      sheetName,
      rows: [],
      headers: [],
      encoding,
      headerMode: "positional_randstad",
      mappingConfidence: "low",
      columnMapping: [],
    };
  }

  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  }) as unknown[][];

  return parseRawMatrix(data, filename, sheetName, encoding);
}

/**
 * Parse CSV from raw bytes with encoding detection.
 */
export function parseCSVBuffer(
  buffer: Buffer | Uint8Array,
  filename: string
): ParsedSpreadsheet {
  let decoded: { text: string; encoding: CsvEncoding };
  try {
    decoded = decodeCsvBuffer(buffer);
  } catch (err) {
    if (err instanceof CsvReadError) throw err;
    throw new CsvReadError();
  }

  try {
    return parseCSV(decoded.text, filename, decoded.encoding);
  } catch (err) {
    if (err instanceof CsvReadError) throw err;
    // Retry with Windows-1252 if UTF path somehow produced unusable content
    if (decoded.encoding === "UTF-8" || decoded.encoding === "UTF-8-BOM") {
      try {
        const fallback = new TextDecoder("windows-1252").decode(
          Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
        );
        return parseCSV(fallback, filename, "Windows-1252");
      } catch {
        throw new CsvReadError();
      }
    }
    throw new CsvReadError();
  }
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string, filename: string): boolean {
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
  ];

  const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".xls", ".csv"];

  if (allowedTypes.includes(mimeType)) return true;

  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  return allowedExtensions.includes(ext);
}

/**
 * Generate safe storage filename
 */
export function generateStorageFilename(originalFilename: string, tenantId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const ext = originalFilename.substring(originalFilename.lastIndexOf("."));
  return `${tenantId}/${timestamp}_${random}${ext}`;
}
