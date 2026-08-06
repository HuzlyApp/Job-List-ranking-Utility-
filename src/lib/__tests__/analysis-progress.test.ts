import { describe, expect, it } from "vitest";
import {
  computeProgressPercent,
  mergeProgress,
  emptyProgress,
} from "@/lib/analysis-progress";
import { mapWithConcurrencySettled } from "@/lib/concurrency";

describe("analysis progress", () => {
  it("computes percent from completed terminal rows only", () => {
    expect(computeProgressPercent(0, 82)).toBe(0);
    expect(computeProgressPercent(38, 82)).toBe(46);
    expect(computeProgressPercent(82, 82)).toBe(100);
  });

  it("never decreases progress percent or processed counts", () => {
    const first = mergeProgress(emptyProgress({ totalRows: 82 }), {
      processedRows: 20,
      successfulRows: 18,
      failedRows: 2,
      progressPercent: 24,
    });
    const second = mergeProgress(first, {
      processedRows: 10,
      successfulRows: 5,
      failedRows: 0,
      progressPercent: 12,
    });
    expect(second.processedRows).toBe(20);
    expect(second.successfulRows).toBe(18);
    expect(second.failedRows).toBe(2);
    expect(second.progressPercent).toBe(24);
  });
});

describe("bounded concurrency", () => {
  it("limits parallel workers", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await mapWithConcurrencySettled(items, 3, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return n * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(results.filter((r) => r.ok).map((r) => (r as { value: number }).value)).toEqual(
      items.map((n) => n * 2)
    );
  });
});
