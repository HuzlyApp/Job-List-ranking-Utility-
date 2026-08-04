/**
 * Deterministic pay validation and market-first pay protection.
 * Server results are authoritative over Grok estimates.
 */

import { calculatePayMidpoint, derivePayRangeFit, type PayRangeFit } from "@/lib/pay-range";
import { parseHourlyRate } from "@/lib/pay-normalization";

export type MarketPayConfidence = "High" | "Medium" | "Low";

export type CalculationStatus =
  | "complete"
  | "incomplete_pay_unavailable"
  | "incomplete_bill_rate_unavailable";

export interface PayRecommendationInput {
  requisitionId: string;
  recommendedMin: number | null;
  recommendedMax: number | null;
  marketPayFloor?: number | null;
  marketPayConfidence?: MarketPayConfidence | null;
  payRecommendationReason?: string | null;
  billRateSupportsMarketPay?: boolean | null;
  billRate?: number | null;
  jobTitle?: string | null;
  payRangeFit?: PayRangeFit | null;
  marketRateWarning?: string | null;
}

export interface ValidatedPayRecommendation {
  recommendedMin: number | null;
  recommendedMax: number | null;
  midpoint: number | null;
  marketPayFloor: number | null;
  marketPayConfidence: MarketPayConfidence;
  payRecommendationReason: string | null;
  billRateSupportsMarketPay: boolean | null;
  payRangeFit: PayRangeFit;
  marketRateWarning: string | null;
  requiresReview: boolean;
  calculationStatus: CalculationStatus;
  dataQualityNotes: string[];
  calculationAdjustments: string[];
}

const MAX_NARROW_RANGE_WIDTH = 8; // $/hr — flag wider without explanation
const SENIOR_TITLE_RE =
  /\b(senior|sr\.?|lead|principal|staff|architect|manager|director)\b/i;
const ENTRY_PAY_CEILING = 45;

/**
 * Validate and normalize a Grok pay recommendation without lowering pay
 * to manufacture profitability.
 */
export function validatePayRecommendation(
  input: PayRecommendationInput
): ValidatedPayRecommendation {
  const notes: string[] = [];
  const adjustments: string[] = [];
  let requiresReview = false;

  // Reject zero / negative / non-finite — never coerce to 0
  let min = parseHourlyRate(input.recommendedMin);
  let max = parseHourlyRate(input.recommendedMax);
  let floor = parseHourlyRate(input.marketPayFloor);

  // Inverted range → flag, do not invent a swap that lowers the ceiling silently
  if (min !== null && max !== null && min > max) {
    notes.push("Inverted pay range detected; flagged for review.");
    requiresReview = true;
    const tmp = min;
    min = max;
    max = tmp;
    adjustments.push("Swapped inverted recommended_w2_pay_min/max for consistency.");
  }

  // Ensure floor is not above recommended min without lowering pay
  if (floor !== null && min !== null && min < floor) {
    notes.push(
      `Recommended minimum ($${min}) was below market pay floor ($${floor}); raised to floor.`
    );
    adjustments.push("Raised recommended_w2_pay_min to market_pay_floor.");
    min = floor;
    if (max !== null && max < min) {
      max = min;
      adjustments.push("Raised recommended_w2_pay_max to match adjusted minimum.");
    }
  }

  // Default floor from min when model omitted it
  if (floor === null && min !== null) {
    floor = min;
    adjustments.push("Derived market_pay_floor from recommended minimum.");
  }

  // Typical range width $2–$5; flag wider without explanation (do not auto-shrink)
  if (min !== null && max !== null) {
    const width = max - min;
    if (width > MAX_NARROW_RANGE_WIDTH) {
      const reason = input.payRecommendationReason || "";
      if (!/uncertain|partial|incomplete|wide/i.test(reason)) {
        notes.push(
          `Pay range width $${width.toFixed(2)} exceeds typical $2–$5 band without uncertainty explanation.`
        );
        requiresReview = true;
      }
    }
  }

  // Senior role with entry-level pay heuristic
  if (
    input.jobTitle &&
    SENIOR_TITLE_RE.test(input.jobTitle) &&
    max !== null &&
    max < ENTRY_PAY_CEILING
  ) {
    notes.push(
      "Senior-titled role received an entry-level pay recommendation; flagged for review."
    );
    requiresReview = true;
  }

  // Deterministic midpoint — never trust model midpoint when both ends exist
  const midpoint = calculatePayMidpoint(min, max);
  if (min !== null && max !== null && midpoint !== null) {
    adjustments.push("Calculated midpoint_pay_rate deterministically from recommended range.");
  }

  const payIncomplete = min === null || max === null || midpoint === null;
  if (payIncomplete) {
    requiresReview = true;
    notes.push(
      "Incomplete or invalid pay recommendation; missing values kept null (not zero)."
    );
  }

  let billSupports = input.billRateSupportsMarketPay ?? null;
  let warning = input.marketRateWarning ?? null;

  if (input.billRate != null && midpoint != null && midpoint > 0) {
    // Rough commercial check: effective rate ~98% of bill, pay+burden must fit
    const effective = input.billRate * 0.98;
    const roughBurden = midpoint * 0.0765 + 3.45; // standard WC path approx
    const profit = effective - midpoint - roughBurden;
    if (profit < 0) {
      if (billSupports !== false) {
        billSupports = false;
        adjustments.push(
          "Set bill_rate_supports_market_pay=false based on deterministic margin check."
        );
      }
      if (!warning) {
        warning = "Competitive candidate pay would produce a negative operating profit";
      }
    } else if (billSupports === null) {
      billSupports = profit >= 2;
    }
  }

  const billIncomplete = parseHourlyRate(input.billRate) === null;

  const payRangeFit =
    input.payRangeFit ||
    derivePayRangeFit({
      billRate: parseHourlyRate(input.billRate),
      payMin: min,
      payMax: max,
      missingRequired: billIncomplete || payIncomplete,
    });

  const calculationStatus: CalculationStatus = payIncomplete
    ? "incomplete_pay_unavailable"
    : billIncomplete
      ? "incomplete_bill_rate_unavailable"
      : "complete";

  return {
    recommendedMin: min,
    recommendedMax: max,
    midpoint: payIncomplete ? null : midpoint,
    marketPayFloor: floor,
    marketPayConfidence: input.marketPayConfidence || "Medium",
    payRecommendationReason: input.payRecommendationReason || null,
    billRateSupportsMarketPay: billSupports,
    payRangeFit: payIncomplete ? "Requires Review" : payRangeFit,
    marketRateWarning: warning,
    requiresReview,
    calculationStatus,
    dataQualityNotes: notes,
    calculationAdjustments: adjustments,
  };
}

/**
 * Normalize requisition IDs for deterministic deduplication.
 * Preserves leading zeroes; trims whitespace; strips surrounding punctuation.
 */
export function normalizeRequisitionId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let id = String(raw).trim();
  if (!id) return null;
  // Strip accidental surrounding punctuation/quotes but keep internal dashes/underscores
  id = id.replace(/^["'`({\[]+|["'`)}\]]+$/g, "").trim();
  if (!id) return null;
  return id;
}

/**
 * Second-pass deterministic deduplication by requisition_id.
 * Never sums submission counts — keeps the highest clearly current count.
 */
export function dedupeByRequisitionId<
  T extends {
    requisition_id?: string | null;
    submissions?: number | null;
    released_date?: string | null;
    data_quality_notes?: string[] | null;
  }
>(rows: T[]): { unique: T[]; duplicatesRemoved: number } {
  const groups = new Map<string, T[]>();
  const withoutId: T[] = [];

  for (const row of rows) {
    const id = normalizeRequisitionId(row.requisition_id ?? null);
    if (!id) {
      withoutId.push(row);
      continue;
    }
    const list = groups.get(id) || [];
    list.push({ ...row, requisition_id: id });
    groups.set(id, list);
  }

  const unique: T[] = [...withoutId];
  let duplicatesRemoved = 0;

  for (const [, group] of groups) {
    if (group.length === 1) {
      unique.push(group[0]);
      continue;
    }
    duplicatesRemoved += group.length - 1;
    unique.push(mergeDuplicateGroup(group));
  }

  return { unique, duplicatesRemoved };
}

function mergeDuplicateGroup<
  T extends {
    requisition_id?: string | null;
    submissions?: number | null;
    released_date?: string | null;
    data_quality_notes?: string[] | null;
  }
>(group: T[]): T {
  // Prefer most complete (fewest null/empty string fields), then latest released_date
  const scored = [...group].sort((a, b) => {
    const completeness = countFilled(b) - countFilled(a);
    if (completeness !== 0) return completeness;
    const dateA = a.released_date ? Date.parse(a.released_date) : 0;
    const dateB = b.released_date ? Date.parse(b.released_date) : 0;
    return dateB - dateA;
  });

  const base: Record<string, unknown> = { ...(scored[0] as object) };
  const notes = new Set<string>(
    Array.isArray(base.data_quality_notes)
      ? (base.data_quality_notes as unknown[]).map(String)
      : []
  );

  let maxSubs = typeof base.submissions === "number" ? base.submissions : null;

  for (let i = 1; i < scored.length; i++) {
    const other = scored[i] as Record<string, unknown>;
    for (const [key, value] of Object.entries(other)) {
      if (key === "submissions") {
        if (typeof value === "number") {
          maxSubs = maxSubs === null ? value : Math.max(maxSubs, value);
        }
        continue;
      }
      if (key === "data_quality_notes") {
        if (Array.isArray(value)) {
          for (const n of value) notes.add(String(n));
        }
        continue;
      }
      const current = base[key];
      if ((current === null || current === undefined || current === "") && value != null && value !== "") {
        base[key] = value;
      } else if (
        current != null &&
        value != null &&
        String(current) !== String(value) &&
        key !== "requisition_id"
      ) {
        notes.add(`Conflict on ${key}: kept "${current}", also saw "${value}"`);
      }
    }
  }

  base.submissions = maxSubs;
  notes.add("Merged duplicate requisition_id rows (deterministic second pass).");
  base.data_quality_notes = Array.from(notes);
  return base as T;
}

function countFilled(obj: object): number {
  return Object.values(obj).filter(
    (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)
  ).length;
}

