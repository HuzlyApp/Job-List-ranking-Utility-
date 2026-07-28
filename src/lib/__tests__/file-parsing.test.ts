import { describe, it, expect } from "vitest";
import { validateUploadFile } from "@/lib/file-validation";
import {
  normalizeColumnHeader,
  detectHeaderRow,
  parseValue,
} from "@/lib/file-parsing";

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

describe("spreadsheet parsing helpers", () => {
  it("maps common column headers", () => {
    expect(normalizeColumnHeader("Req ID")).toBe("requisition_id");
    expect(normalizeColumnHeader("C2C Rate")).toBe("c2c_bill_rate");
    expect(normalizeColumnHeader("Subs")).toBe("submissions");
  });

  it("detects header row", () => {
    const data = [
      ["Report generated"],
      ["Status", "Req ID", "Customer", "Subs", "C2C Rate"],
      ["Open", "123", "Acme", 2, 85],
    ];
    expect(detectHeaderRow(data)).toBe(1);
  });

  it("parses bill rate", () => {
    expect(parseValue("$85.50", "c2c_bill_rate")).toBe(85.5);
  });

  it("preserves exact submission count", () => {
    expect(parseValue(3, "submissions")).toBe(3);
  });
});
