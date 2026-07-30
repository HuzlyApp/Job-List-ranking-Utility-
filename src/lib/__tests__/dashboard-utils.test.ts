import { describe, expect, it } from "vitest";
import {
  coercePositiveInt,
  selectEmptyStateKind,
} from "@/lib/dashboard-utils";

describe("coercePositiveInt", () => {
  it("defaults when page is missing (null coerces to 0 without this helper)", () => {
    expect(coercePositiveInt(null, 1)).toBe(1);
    expect(coercePositiveInt("", 1)).toBe(1);
    expect(coercePositiveInt("0", 1, { min: 1 })).toBe(1);
    expect(coercePositiveInt("2", 1)).toBe(2);
    expect(coercePositiveInt("abc", 20)).toBe(20);
    expect(coercePositiveInt("150", 20, { max: 100 })).toBe(100);
  });
});

describe("selectEmptyStateKind", () => {
  it("shows first-time empty only when no requisitions and no active batch", () => {
    expect(
      selectEmptyStateKind({
        totalRequisitions: 0,
        hasActiveFilters: false,
        filteredCount: 0,
        latestBatchStatus: null,
      })
    ).toBe("first_time");
  });

  it("shows filtered empty when requisitions exist but filters exclude all", () => {
    expect(
      selectEmptyStateKind({
        totalRequisitions: 67,
        hasActiveFilters: true,
        filteredCount: 0,
      })
    ).toBe("filtered");
  });

  it("does not hide populated dashboards", () => {
    expect(
      selectEmptyStateKind({
        totalRequisitions: 67,
        hasActiveFilters: false,
        filteredCount: 20,
      })
    ).toBe("none");
  });

  it("surfaces processing / review / failed batch states", () => {
    expect(
      selectEmptyStateKind({
        totalRequisitions: 0,
        hasActiveFilters: false,
        filteredCount: 0,
        latestBatchStatus: "analyzing",
      })
    ).toBe("processing");

    expect(
      selectEmptyStateKind({
        totalRequisitions: 0,
        hasActiveFilters: false,
        filteredCount: 0,
        latestBatchStatus: "awaiting_review",
      })
    ).toBe("awaiting_review");

    expect(
      selectEmptyStateKind({
        totalRequisitions: 0,
        hasActiveFilters: false,
        filteredCount: 0,
        latestBatchStatus: "failed",
      })
    ).toBe("failed");
  });
});
