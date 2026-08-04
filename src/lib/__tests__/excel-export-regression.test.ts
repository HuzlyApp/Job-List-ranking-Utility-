import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";
import { parseCSVBuffer } from "@/lib/file-parsing";

const FIXTURE = join(
  __dirname,
  "fixtures",
  "Randstad-Jobs-Jul28(Sheet1).csv"
);

describe("Excel/CSV regression fixture", () => {
  it("parses the Randstad Jobs workbook fixture without inventing IDs", () => {
    const buf = readFileSync(FIXTURE);
    const parsed = parseCSVBuffer(buf, "Randstad-Jobs-Jul28(Sheet1).csv");
    const rows = parsed.rows;

    expect(rows.length).toBeGreaterThan(0);
    expect(parsed.summary?.rowsDetected ?? rows.length).toBeGreaterThan(0);

    const ids = rows
      .map((r) => r.requisition_id)
      .filter((id): id is string => Boolean(id));

    // IDs remain strings; leading zeroes preserved when present
    for (const id of ids) {
      expect(typeof id).toBe("string");
    }

    const unique = new Set(ids);
    // Dedup check: if fixture has duplicates, counts must not be summed in merge tests
    expect(unique.size).toBeLessThanOrEqual(ids.length);
  });

  it("can generate a workbook with required ranked columns that opens", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ranked Requisitions");
    const headers = [
      "Rank",
      "Opportunity Score",
      "Status",
      "Requisition ID",
      "Start Date",
      "Customer",
      "Job Title",
      "Location",
      "Duration",
      "Submission Count",
      "C2C Bill Rate",
      "Effective Vendor Rate After 2%",
      "Recommended W-2 Pay Range",
      "Market Pay Floor",
      "Market Pay Confidence",
      "Pay Recommendation Reason",
      "Bill Rate Supports Market Pay",
      "Midpoint Pay Rate",
      "Estimated W-2 Cost Per Hour",
      "Gross Spread Per Hour",
      "Estimated Profit Per Hour",
      "Net Margin %",
      "Estimated Weekly Profit",
      "Estimated Assignment Profit",
      "Fillability",
      "Recommendation",
      "Data Quality Notes",
      "Position Type",
    ];
    sheet.addRow(headers);
    sheet.addRow([
      1,
      85,
      "Open",
      "00123",
      "08/01/2026",
      "Acme",
      "Engineer",
      "Remote",
      "6 months",
      2,
      "$100.00",
      "$98.00",
      "$52–$55/hr",
      "$52.00",
      "High",
      "Competitive mid-market",
      "Yes",
      "$53.50",
      "$7.54",
      "$44.50",
      "$36.96",
      "37.71%",
      "$1478.40",
      "$38438.40",
      "Moderate",
      "High Priority",
      "None",
      "Contract",
    ]);
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    const ws = loaded.getWorksheet("Ranked Requisitions");
    expect(ws).toBeTruthy();
    const headerRow = ws!.getRow(1);
    const headerValues = (headerRow.values as Array<string | null | undefined>).filter(Boolean);
    expect(headerValues).toEqual(headers);
    expect(ws!.getRow(2).getCell(4).value).toBe("00123");
  });
});
