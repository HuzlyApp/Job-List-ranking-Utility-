import * as XLSX from "xlsx";
import type { ExtractedRequisition } from "@/types";
import { COLUMN_ALIASES } from "@/types";

export interface ParsedSpreadsheet {
  sheetName: string;
  rows: ExtractedRequisition[];
  headers: string[];
}

/**
 * Normalize column header to standard field name
 */
export function normalizeColumnHeader(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === normalized)) {
      return field;
    }
  }
  
  return null;
}

/**
 * Detect header row in spreadsheet
 */
export function detectHeaderRow(data: unknown[][]): number {
  // Look for row with most column aliases
  let bestRow = 0;
  let maxMatches = 0;
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    
    const matches = row.filter(cell => {
      if (typeof cell !== "string") return false;
      return normalizeColumnHeader(cell) !== null;
    }).length;
    
    if (matches > maxMatches) {
      maxMatches = matches;
      bestRow = i;
    }
  }
  
  return bestRow;
}

/**
 * Parse value based on expected type
 */
export function parseValue(value: unknown, field: string): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  
  switch (field) {
    case "submissions":
    case "number_of_positions":
    case "active_submissions":
      if (typeof value === "number") return value;
      const num = parseInt(String(value).replace(/[^\d-]/g, ""), 10);
      return isNaN(num) ? null : num;
      
    case "c2c_bill_rate":
      if (typeof value === "number") return value;
      const rate = parseFloat(String(value).replace(/[$,]/g, ""));
      return isNaN(rate) ? null : rate;
      
    case "start_date":
    case "released_date":
      if (value instanceof Date) return value.toISOString().split("T")[0];
      if (typeof value === "string") {
        // Try to parse date
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split("T")[0];
        }
      }
      return null;
      
    default:
      return String(value).trim() || null;
  }
}

/**
 * Parse spreadsheet buffer
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
    }) as unknown[][];
    
    if (data.length === 0) continue;
    
    const headerRow = detectHeaderRow(data);
    const headers = data[headerRow].map(h => String(h).trim());
    const fieldMapping: Record<number, string> = {};
    
    // Build field mapping
    headers.forEach((header, index) => {
      const field = normalizeColumnHeader(header);
      if (field) {
        fieldMapping[index] = field;
      }
    });
    
    const rows: ExtractedRequisition[] = [];
    
    // Parse data rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row) || row.every(cell => !cell)) continue;
      
      const record: Partial<ExtractedRequisition> = {
        source_record_key: `${filename}:${sheetName}:row${i + 1}`,
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
      };
      
      let hasData = false;
      
      for (const [index, field] of Object.entries(fieldMapping)) {
        const value = row[parseInt(index)];
        if (value !== undefined && value !== null && value !== "") {
          hasData = true;
          (record as Record<string, unknown>)[field] = parseValue(value, field);
        }
      }
      
      if (hasData) {
        rows.push(record as ExtractedRequisition);
      }
    }
    
    results.push({
      sheetName,
      rows,
      headers,
    });
  }
  
  return results;
}

/**
 * Parse CSV string
 */
export function parseCSV(content: string, filename: string): ParsedSpreadsheet {
  const workbook = XLSX.read(content, {
    type: "string",
  });
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: true,
  }) as unknown[][];
  
  if (data.length === 0) {
    return { sheetName, rows: [], headers: [] };
  }
  
  const headerRow = detectHeaderRow(data);
  const headers = data[headerRow].map(h => String(h).trim());
  const fieldMapping: Record<number, string> = {};
  
  headers.forEach((header, index) => {
    const field = normalizeColumnHeader(header);
    if (field) {
      fieldMapping[index] = field;
    }
  });
  
  const rows: ExtractedRequisition[] = [];
  
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row) || row.every(cell => !cell)) continue;
    
    const record: Partial<ExtractedRequisition> = {
      source_record_key: `${filename}:row${i + 1}`,
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
    };
    
    let hasData = false;
    
    for (const [index, field] of Object.entries(fieldMapping)) {
      const value = row[parseInt(index)];
      if (value !== undefined && value !== null && value !== "") {
        hasData = true;
        (record as Record<string, unknown>)[field] = parseValue(value, field);
      }
    }
    
    if (hasData) {
      rows.push(record as ExtractedRequisition);
    }
  }
  
  return { sheetName, rows, headers };
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
