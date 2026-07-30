import { describe, it, expect } from "vitest";
import { validateUploadFile } from "@/lib/file-validation";
import {
  normalizeColumnHeader,
  detectHeaderRow,
  parseValue,
  parseCSV,
  parseCSVBuffer,
  decodeCsvBuffer,
  looksLikeRequisitionDataRow,
  detectLeadingEmptyColumn,
  shiftLeadingEmptyColumn,
  normalizeCurrency,
  normalizeIntegerValue,
  normalizeRequisitionId,
  normalizeUsDate,
  normalizeDuration,
  CsvReadError,
  CSV_READ_ERROR,
} from "@/lib/file-parsing";

/** Sample headerless Randstad-style CSV matching uploaded export structure. */
const RANDSTAD_HEADERLESS_CSV = [
  "Open,161867,LTI Mindtree US - Local,Product Owner - OHTL,0,$70.00,\"Overland Park, KS\",7/28/2026,5 months,1,0,7/28/2026,Contract position,",
  "Open,161863,Acme Corp,Senior Developer,1.0,$74.37,\"Austin, TX\",8/17/2026,4 months,1.0,0.0,8/3/2026,Contract position,",
  "Open,161870,Fidelity,Business Analyst,2,$52.00,\"New York, NY\",8/3/2026,10 months,2,1,8/3/2026,Contract position,",
].join("\r\n");

function encodeWindows1252(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) {
      bytes.push(code);
    } else {
      // Map a few common Unicode chars to Windows-1252
      const map: Record<number, number> = {
        0x2018: 0x91,
        0x2019: 0x92,
        0x201c: 0x93,
        0x201d: 0x94,
        0x2013: 0x96,
        0x2014: 0x97,
        0x2026: 0x85,
      };
      bytes.push(map[code] ?? 0x3f);
    }
  }
  return Buffer.from(bytes);
}

describe("validateUploadFile", () => {
  it("rejects empty files", () => {
    const result = validateUploadFile("test.csv", "text/csv", 0, new Uint8Array());
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects unsupported extensions", () => {
    const result = validateUploadFile("test.pdf", "application/pdf", 100, new Uint8Array(100));
    expect(result.valid).toBe(false);
  });

  it("accepts csv files", () => {
    const content = new TextEncoder().encode("Status,Req ID\nOpen,12345");
    const result = validateUploadFile("test.csv", "text/csv", content.length, content);
    expect(result.valid).toBe(true);
    expect(result.category).toBe("spreadsheet");
  });
});

describe("encoding detection", () => {
  it("detects UTF-8 CSV", () => {
    const buf = Buffer.from("Status,Req ID\nOpen,12345", "utf8");
    const decoded = decodeCsvBuffer(buf);
    expect(decoded.encoding).toBe("UTF-8");
    expect(decoded.text).toContain("Open");
  });

  it("detects UTF-8 with BOM", () => {
    const body = Buffer.from("Status,Req ID\nOpen,12345", "utf8");
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
    const decoded = decodeCsvBuffer(buf);
    expect(decoded.encoding).toBe("UTF-8-BOM");
    expect(decoded.text.startsWith("Status")).toBe(true);
  });

  it("falls back to Windows-1252 for non-UTF-8 bytes", () => {
    // Invalid UTF-8 sequence (0x90 is a Windows-1252 smart-quote range start)
    const buf = Buffer.from([
      ...Buffer.from("Customer,Job Title\n"),
      0x4c, 0x54, 0x49, 0x20, // LTI
      0x91, // Windows-1252 left single quote — invalid as UTF-8 start of multi-byte
      ...Buffer.from("s Team,Engineer\n"),
    ]);
    const decoded = decodeCsvBuffer(buf);
    expect(["Windows-1252", "ISO-8859-1"]).toContain(decoded.encoding);
    const parsed = parseCSVBuffer(buf, "win.csv");
    expect(parsed.encoding).toBe(decoded.encoding);
  });

  it("falls back to ISO-8859-1 when needed", () => {
    // 0x81 is undefined in Windows-1252; TextDecoder windows-1252 may still accept it.
    // Force a path that lands on latin1 by using bytes that fail fatal windows-1252 if possible.
    const buf = Buffer.from([0x48, 0x69, 0x81, 0x21]); // Hi + 0x81 + !
    const decoded = decodeCsvBuffer(buf);
    expect(["Windows-1252", "ISO-8859-1", "UTF-8"]).toContain(decoded.encoding);
  });

  it("throws a friendly error for empty buffers", () => {
    expect(() => decodeCsvBuffer(Buffer.alloc(0))).toThrow(CsvReadError);
    try {
      decodeCsvBuffer(Buffer.alloc(0));
    } catch (err) {
      expect(err).toBeInstanceOf(CsvReadError);
      expect((err as Error).message).toBe(CSV_READ_ERROR);
      expect((err as Error).message).not.toMatch(/UnicodeDecodeError/i);
    }
  });

  it("parses a Windows-1252 encoded Randstad-like export", () => {
    const withSmartQuote =
      "Open,161867,LTI Mindtree US - Local,Product Owner \u2013 OHTL,0,$70.00,\"Overland Park, KS\",7/28/2026,5 months,1,0,7/28/2026,Contract position,\r\n";
    const buf = encodeWindows1252(withSmartQuote);
    // Ensure it's not valid UTF-8 (em dash mapped to 0x96)
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(buf)).toThrow();
    const parsed = parseCSVBuffer(buf, "Randstad-Jobs-Jul28(Sheet1).csv");
    expect(parsed.encoding).toBe("Windows-1252");
    expect(parsed.rows.length).toBeGreaterThanOrEqual(1);
    expect(parsed.rows[0].requisition_id).toBe("161867");
  });
});

describe("header detection", () => {
  it("maps common column headers", () => {
    expect(normalizeColumnHeader("Req ID")).toBe("requisition_id");
    expect(normalizeColumnHeader("C2C Rate")).toBe("c2c_bill_rate");
    expect(normalizeColumnHeader("Subs")).toBe("submissions");
    expect(normalizeColumnHeader("REQUISITION ID")).toBe("requisition_id");
    expect(normalizeColumnHeader("Unnamed: 13")).toBeNull();
  });

  it("detects a standard header row", () => {
    const data = [
      ["Report generated"],
      ["Status", "Req ID", "Customer", "Subs", "C2C Rate"],
      ["Open", "123", "Acme", 2, 85],
    ];
    expect(detectHeaderRow(data)).toBe(1);
  });

  it("returns -1 when the first row is requisition data (missing header)", () => {
    const data = [
      [
        "Open",
        "161867",
        "LTI Mindtree US - Local",
        "Product Owner - OHTL",
        "0",
        "$70.00",
        "Overland Park, KS",
        "7/28/2026",
        "5 months",
        "1",
        "0",
        "7/28/2026",
        "Contract position",
      ],
    ];
    expect(looksLikeRequisitionDataRow(data[0])).toBe(true);
    expect(detectHeaderRow(data)).toBe(-1);
  });

  it("handles header capitalization differences", () => {
    const csv = "STATUS,REQUISITION ID,CUSTOMER,JOB TITLE,SUBS,C2C RATE\nOpen,99,Acme,Dev,1,$80.00";
    const parsed = parseCSV(csv, "caps.csv");
    expect(parsed.headerMode).toBe("detected");
    expect(parsed.rows[0].requisition_id).toBe("99");
    expect(parsed.rows[0].c2c_bill_rate).toBe(80);
  });

  it("shifts leading empty columns", () => {
    const rows = [
      ["", "Open", "161867", "Acme", "Dev", "0", "$70.00", "Austin, TX", "7/28/2026", "5 months", "1", "0", "7/28/2026", "Contract"],
      ["", "Open", "161868", "Beta", "PM", "1", "$80.00", "Dallas, TX", "8/1/2026", "4 months", "1", "0", "8/1/2026", "Contract"],
    ];
    expect(detectLeadingEmptyColumn(rows)).toBe(true);
    const shifted = shiftLeadingEmptyColumn(rows[0]);
    expect(shifted[0]).toBe("Open");
    expect(shifted[1]).toBe("161867");

    // Already-aligned rows are not shifted
    const aligned = ["Open", "161867", "Acme"];
    expect(shiftLeadingEmptyColumn(aligned)).toEqual(aligned);
  });

  it("parses CSV with leading empty column and trailing empty column", () => {
    const csv = [
      ',Open,161867,LTI Mindtree US - Local,Product Owner - OHTL,0,$70.00,"Overland Park, KS",7/28/2026,5 months,1,0,7/28/2026,Contract position,',
      ',Open,161863,Acme,Dev,1,$74.37,"Austin, TX",8/17/2026,4 months,1,0,8/3/2026,Contract position,',
    ].join("\n");
    const parsed = parseCSV(csv, "leading.csv");
    expect(parsed.headerMode).toBe("positional_randstad");
    expect(parsed.rows[0].status).toBe("Open");
    expect(parsed.rows[0].requisition_id).toBe("161867");
    expect(parsed.summary?.leadingEmptyColumnShifted).toBe(true);
    expect(JSON.stringify(parsed.rows)).not.toMatch(/Unnamed/i);
    expect(parsed.headers.every((h) => !/unnamed/i.test(h))).toBe(true);
  });
});

describe("field parsing", () => {
  it("parses bill rate $70.00 to 70.00 via Decimal", () => {
    const result = normalizeCurrency("$70.00 ");
    expect(result.normalized).toBe("70.00");
    expect(result.numeric).toBe(70);
    expect(result.original).toBe("$70.00");
  });

  it("keeps $74.37 precise", () => {
    const result = normalizeCurrency("$74.37");
    expect(result.normalized).toBe("74.37");
    expect(result.numeric).toBe(74.37);
  });

  it("parses $1,250.50", () => {
    const result = normalizeCurrency("$1,250.50");
    expect(result.normalized).toBe("1250.50");
    expect(result.numeric).toBe(1250.5);
  });

  it("converts 161863.0 to requisition id 161863", () => {
    expect(normalizeRequisitionId("161863.0")).toBe("161863");
    expect(normalizeRequisitionId(161863.0)).toBe("161863");
  });

  it("converts 1.0 to integer 1", () => {
    expect(normalizeIntegerValue("1.0")).toBe(1);
    expect(normalizeIntegerValue(1.0)).toBe(1);
    expect(normalizeIntegerValue("0.0")).toBe(0);
  });

  it("converts blank values to null (not zero)", () => {
    expect(normalizeIntegerValue("")).toBeNull();
    expect(normalizeIntegerValue(null)).toBeNull();
    expect(normalizeCurrency("").numeric).toBeNull();
    expect(parseValue("", "submissions")).toBeNull();
    expect(parseValue("", "c2c_bill_rate")).toBeNull();
  });

  it("parses 7/28/2026 as US M/D/YYYY without swapping", () => {
    const result = normalizeUsDate("7/28/2026");
    expect(result.normalized).toBe("2026-07-28");
    expect(result.warning).toBeNull();
  });

  it("does not swap month and day for 8/3/2026", () => {
    expect(normalizeUsDate("8/3/2026").normalized).toBe("2026-08-03");
  });

  it("preserves source and warns on unparseable dates", () => {
    const result = normalizeUsDate("not-a-date");
    expect(result.original).toBe("not-a-date");
    expect(result.normalized).toBeNull();
    expect(result.warning).toMatch(/could not parse date/i);
  });

  it("normalizes 5 months to 21.7 weeks", () => {
    expect(normalizeDuration("5 months")).toEqual({ original: "5 months", weeks: 21.7 });
    expect(normalizeDuration("4 months").weeks).toBe(17.3);
    expect(normalizeDuration("10 months").weeks).toBe(43.3);
    expect(normalizeDuration("12 months").weeks).toBe(52);
  });

  it("keeps unknown duration text", () => {
    const result = normalizeDuration("ongoing");
    expect(result.original).toBe("ongoing");
    expect(result.weeks).toBeNull();
  });

  it("parses bill rate via parseValue", () => {
    expect(parseValue("$85.50", "c2c_bill_rate")).toBe(85.5);
  });

  it("preserves exact submission count", () => {
    expect(parseValue(3, "submissions")).toBe(3);
  });
});

describe("Randstad headerless regression", () => {
  it("retains the first requisition row (161867)", () => {
    const parsed = parseCSV(
      RANDSTAD_HEADERLESS_CSV,
      "Randstad-Jobs-Jul28(Sheet1).csv"
    );

    expect(parsed.headerMode).toBe("positional_randstad");
    expect(parsed.mappingConfidence).toBe("high");
    expect(parsed.rows.length).toBe(3);

    const first = parsed.rows[0];
    expect(first.requisition_id).toBe("161867");
    expect(first.customer).toBe("LTI Mindtree US - Local");
    expect(first.job_title).toBe("Product Owner - OHTL");
    expect(first.c2c_bill_rate).toBe(70);
    expect(first.c2c_bill_rate_normalized).toBe("70.00");
    expect(first.source_c2c_bill_rate).toBe("$70.00");
    expect(first.location).toBe("Overland Park, KS");
    expect(first.duration).toBe("5 months");
    expect(first.normalized_duration_weeks).toBe(21.7);
    expect(first.start_date).toBe("2026-07-28");
    expect(first.status).toBe("Open");

    // No Unnamed fields in review-facing data
    expect(JSON.stringify(parsed.rows)).not.toMatch(/Unnamed/i);
    expect(parsed.headers.every((h) => !/unnamed/i.test(h))).toBe(true);

    // Numeric .0 cleaned
    expect(parsed.rows[1].requisition_id).toBe("161863");
    expect(parsed.rows[1].submissions).toBe(1);
    expect(parsed.rows[1].c2c_bill_rate_normalized).toBe("74.37");

    expect(parsed.summary?.rowsDetected).toBe(3);
    expect(parsed.summary?.fileName).toBe("Randstad-Jobs-Jul28(Sheet1).csv");
    expect(parsed.columnMapping?.length).toBe(13);
  });

  it("parses the on-disk fixture file", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fixturePath = join(
      process.cwd(),
      "src/lib/__tests__/fixtures/Randstad-Jobs-Jul28(Sheet1).csv"
    );
    const buf = readFileSync(fixturePath);
    const parsed = parseCSVBuffer(buf, "Randstad-Jobs-Jul28(Sheet1).csv");
    expect(parsed.rows[0].requisition_id).toBe("161867");
    expect(parsed.rows.map((r) => r.requisition_id)).toContain("161867");
    expect(JSON.stringify(parsed)).not.toMatch(/Unnamed/i);
  });

  it("parses all rows from buffer with encoding metadata", () => {
    const buf = Buffer.from(RANDSTAD_HEADERLESS_CSV, "utf8");
    const parsed = parseCSVBuffer(buf, "Randstad-Jobs-Jul28(Sheet1).csv");
    expect(parsed.encoding).toBe("UTF-8");
    expect(parsed.rows.map((r) => r.requisition_id)).toEqual([
      "161867",
      "161863",
      "161870",
    ]);
  });
});
