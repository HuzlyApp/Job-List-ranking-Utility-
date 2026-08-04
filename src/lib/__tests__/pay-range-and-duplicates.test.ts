import { describe, expect, it } from "vitest";
import {
  calculatePayMidpoint,
  derivePayRangeFit,
  formatPayRange,
  formatPayRate,
  resolveTargetPayRate,
  buildPayFirstExplanation,
} from "@/lib/pay-range";
import {
  annotateImportRows,
  duplicateStatusBadgeClass,
  possibleDuplicateSignature,
  summarizeDuplicateAnnotations,
  type ExistingRequisitionMatch,
} from "@/lib/duplicate-check-core";

describe("pay-range helpers", () => {
  it("formats pay range from numeric min/max", () => {
    expect(formatPayRange(52, 54)).toBe("$52–$54/hr");
    expect(formatPayRange("61.00", "63.00")).toBe("$61–$63/hr");
  });

  it("shows pending / failed / requires review statuses", () => {
    expect(formatPayRange(null, null, "pending")).toBe("Pending Analysis");
    expect(formatPayRange(null, null, "failed")).toBe("Analysis Failed");
    expect(formatPayRange(null, null, "requires_review")).toBe("Requires Review");
    expect(formatPayRange(null, 50)).toBe("Requires Review");
    expect(formatPayRange(null, null)).toBe("Not available");
  });

  it("calculates midpoint and target scenarios", () => {
    expect(calculatePayMidpoint(61, 63)).toBe(62);
    expect(resolveTargetPayRate({ min: 61, max: 63, scenario: "midpoint" })).toBe(62);
    expect(resolveTargetPayRate({ min: 61, max: 63, scenario: "minimum" })).toBe(61);
    expect(resolveTargetPayRate({ min: 61, max: 63, scenario: "maximum" })).toBe(63);
    expect(
      resolveTargetPayRate({
        min: 61,
        max: 63,
        scenario: "custom",
        customRate: 62.5,
      })
    ).toBe(62.5);
  });

  it("formats single pay rate", () => {
    expect(formatPayRate(62)).toBe("$62/hr");
    expect(formatPayRate(null)).toBe("Not available");
    expect(formatPayRate(0)).toBe("Not available");
  });

  it("never displays $0-$0/hr", () => {
    expect(formatPayRange(0, 0)).toBe("Not available");
    expect(formatPayRange("0.00", "0.00")).toBe("Not available");
  });

  it("derives pay range fit from bill headroom", () => {
    expect(
      derivePayRangeFit({ billRate: 100, payMin: 48, payMax: 52 })
    ).toBe("Strong Fit");
    expect(
      derivePayRangeFit({ billRate: 70, payMin: 60, payMax: 64 })
    ).toBe("Below Market");
    expect(
      derivePayRangeFit({
        billRate: null,
        payMin: 50,
        payMax: 52,
        missingRequired: true,
      })
    ).toBe("Requires Review");
  });

  it("builds pay-first explanations", () => {
    const text = buildPayFirstExplanation({
      payMin: 61,
      payMax: 63,
      payRangeFit: "Workable",
      fillabilityLabel: "Moderate",
      submissionCount: 1,
      netMarginPercent: 8.4,
    });
    expect(text.startsWith("Recommended pay is $61–$63/hr")).toBe(true);
    expect(text).toContain("Pay range fit: Workable");
    expect(text).toContain("Secondary margin context");
    expect(text.indexOf("Recommended pay")).toBeLessThan(text.indexOf("margin"));
  });
});

describe("duplicate annotations", () => {
  const existing: ExistingRequisitionMatch = {
    id: "11111111-1111-4111-8111-111111111111",
    requisitionId: "REQ-1",
    status: "Open",
    sourceCustomerName: "Acme",
    normalizedCustomerName: "Acme",
    jobTitle: "Engineer",
    location: "Remote",
    displayedVendorRate: "70.00",
    submissionCount: 3,
    activeSubmissionCount: 1,
    sourceDuration: "6 months",
    releasedDate: null,
    firstSeenAt: new Date("2026-01-01"),
    lastSeenAt: new Date("2026-01-02"),
    lastAnalyzedAt: new Date("2026-01-02"),
    recommendedPayMin: "50.00",
    recommendedPayMax: "52.00",
  };

  it("marks current-batch duplicates without summing", () => {
    const rows = [
      { requisition_id: "REQ-1", customer: "Acme", job_title: "Engineer", location: "Remote" },
      { requisition_id: "REQ-1", customer: "Acme", job_title: "Engineer", location: "Remote" },
      { requisition_id: "REQ-2", customer: "Beta", job_title: "Analyst", location: "NY" },
    ];
    const annotated = annotateImportRows({
      rows,
      existingByReqId: new Map(),
    });
    expect(annotated[0].duplicate.duplicateStatus).toBe("Duplicate in Current Import");
    expect(annotated[0].duplicate.batchOccurrenceCount).toBe(2);
    expect(annotated[2].duplicate.duplicateStatus).toBe("New");
  });

  it("marks already-exists against Neon matches", () => {
    const annotated = annotateImportRows({
      rows: [{ requisition_id: "REQ-1", customer: "Acme", job_title: "Engineer" }],
      existingByReqId: new Map([["REQ-1", existing]]),
    });
    expect(annotated[0].duplicate.duplicateStatus).toBe("Already Exists");
    expect(annotated[0].duplicate.matchedExistingRequisitionId).toBe(existing.id);
  });

  it("marks possible duplicates when ID is missing", () => {
    const row = {
      requisition_id: null as string | null,
      customer: "Acme",
      job_title: "Engineer",
      location: "Remote",
    };
    const sig = possibleDuplicateSignature(row);
    const annotated = annotateImportRows({
      rows: [row],
      existingByReqId: new Map(),
      possibleBySignature: new Map([[sig, [existing]]]),
    });
    expect(annotated[0].duplicate.duplicateStatus).toBe("Possible Duplicate");
  });

  it("summarizes annotations and exposes badge classes", () => {
    const annotated = annotateImportRows({
      rows: [
        { requisition_id: "A" },
        { requisition_id: "A" },
        { requisition_id: "B" },
      ],
      existingByReqId: new Map([["B", existing]]),
    });
    const summary = summarizeDuplicateAnnotations(
      annotated.map((r) => ({
        requisition_id: r.requisition_id,
        duplicate: r.duplicate,
      }))
    );
    expect(summary.totalSourceRows).toBe(3);
    expect(summary.uniqueRequisitionIds).toBe(2);
    expect(summary.existingMatches).toBe(1);
    expect(duplicateStatusBadgeClass("Already Exists")).toContain("amber");
  });
});
