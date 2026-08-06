/**
 * Canonical Grok pay-field normalization.
 * Never converts missing/invalid values to zero.
 */

export type MarketPayConfidence = "High" | "Medium" | "Low";

export type PayRecommendation = {
  recommended_w2_pay_min: number | null;
  recommended_w2_pay_max: number | null;
  midpoint_pay_rate: number | null;
  market_pay_floor: number | null;
  market_pay_confidence: MarketPayConfidence | null;
  pay_recommendation_reason: string | null;
  bill_rate_supports_market_pay: boolean | null;
};

/**
 * Parse an hourly pay value from number, numeric string, or currency-formatted string.
 * Returns null for missing, zero, negative, or unparseable values.
 */
export function parseHourlyRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^n\/?a$/i.test(trimmed) || /^null$/i.test(trimmed)) {
      return null;
    }

    // Combined range in a single field — not a single rate
    if (/[-–—]/.test(trimmed) && /\$?\d/.test(trimmed)) {
      return null;
    }

    const normalized = trimmed
      .replace(/[$,\s]/g, "")
      .replace(/\/hr$/i, "")
      .replace(/per\s*hour$/i, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

/**
 * Parse a combined pay range string such as "$72-$76/hr" or "72 – 76".
 */
export function parseCombinedPayRange(
  value: unknown
): { min: number | null; max: number | null } {
  if (typeof value !== "string" || !value.trim()) {
    return { min: null, max: null };
  }

  const cleaned = value
    .trim()
    .replace(/\/hr$/i, "")
    .replace(/per\s*hour$/i, "")
    .replace(/[$,]/g, "");

  const match = cleaned.match(
    /(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)/i
  );
  if (!match) {
    const single = parseHourlyRate(cleaned);
    return { min: single, max: single };
  }

  const min = parseHourlyRate(match[1]);
  const max = parseHourlyRate(match[2]);
  return { min, max };
}

export function calculateDeterministicMidpoint(
  min: number | null,
  max: number | null
): number | null {
  if (min === null || max === null) return null;
  if (!(min > 0) || !(max > 0)) return null;
  return Math.round(((min + max) / 2) * 100) / 100;
}

/**
 * Normalize a raw Grok (or legacy) pay-analysis job object into canonical fields.
 * Supports numeric values, currency strings, and a combined range field.
 */
export function normalizeGrokPayRecommendation(
  raw: Record<string, unknown>
): PayRecommendation {
  let min =
    parseHourlyRate(raw.recommended_w2_pay_min) ??
    parseHourlyRate(raw.recommended_pay_min);
  let max =
    parseHourlyRate(raw.recommended_w2_pay_max) ??
    parseHourlyRate(raw.recommended_pay_max);

  if (min === null || max === null) {
    const rangeCandidates = [
      raw.recommended_w2_pay_range,
      raw.recommended_pay_range,
      raw.pay_range,
    ];
    for (const candidate of rangeCandidates) {
      const combined = parseCombinedPayRange(candidate);
      if (min === null && combined.min !== null) min = combined.min;
      if (max === null && combined.max !== null) max = combined.max;
      if (min !== null && max !== null) break;
    }
  }

  // Ignore model-provided midpoint when both ends are available
  const midpoint = calculateDeterministicMidpoint(min, max);

  const floor =
    parseHourlyRate(raw.market_pay_floor) ??
    parseHourlyRate(raw.marketPayFloor);

  const confidenceRaw =
    raw.market_pay_confidence ??
    raw.marketPayConfidence ??
    raw.pay_range_confidence;
  const market_pay_confidence =
    confidenceRaw === "High" ||
    confidenceRaw === "Medium" ||
    confidenceRaw === "Low"
      ? confidenceRaw
      : null;

  const reason =
    (typeof raw.pay_recommendation_reason === "string" &&
      raw.pay_recommendation_reason.trim()) ||
    (typeof raw.pay_estimate_reason === "string" &&
      raw.pay_estimate_reason.trim()) ||
    (typeof raw.pay_range_reason === "string" &&
      raw.pay_range_reason.trim()) ||
    null;

  let billSupport: boolean | null = null;
  const billRaw =
    raw.bill_rate_supports_market_pay ?? raw.billRateSupportsMarketPay;
  if (typeof billRaw === "boolean") billSupport = billRaw;
  else if (billRaw === "true" || billRaw === 1) billSupport = true;
  else if (billRaw === "false" || billRaw === 0) billSupport = false;

  return {
    recommended_w2_pay_min: min,
    recommended_w2_pay_max: max,
    midpoint_pay_rate: midpoint,
    market_pay_floor: floor,
    market_pay_confidence,
    pay_recommendation_reason: reason,
    bill_rate_supports_market_pay: billSupport,
  };
}

/**
 * Normalize an entire Grok pay-analysis response payload before Zod validation.
 */
export function normalizeGrokPayAnalysisPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.jobs)) return data;

  return {
    ...obj,
    jobs: obj.jobs.map((job) => {
      if (!job || typeof job !== "object") return job;
      const raw = job as Record<string, unknown>;
      const pay = normalizeGrokPayRecommendation(raw);
      return {
        ...raw,
        requisition_id:
          (typeof raw.requisition_id === "string" && raw.requisition_id) ||
          (typeof raw.id === "string" && raw.id) ||
          raw.requisition_id,
        recommended_w2_pay_min: pay.recommended_w2_pay_min,
        recommended_w2_pay_max: pay.recommended_w2_pay_max,
        recommended_pay_min: pay.recommended_w2_pay_min,
        recommended_pay_max: pay.recommended_w2_pay_max,
        market_pay_floor: pay.market_pay_floor,
        market_pay_confidence: pay.market_pay_confidence,
        pay_recommendation_reason: pay.pay_recommendation_reason,
        bill_rate_supports_market_pay: pay.bill_rate_supports_market_pay,
      };
    }),
  };
}

/** Explicit snake_case → camelCase mapping for API / UI layers. */
export function toPayRecommendationCamel(pay: PayRecommendation): {
  recommendedPayMin: number | null;
  recommendedPayMax: number | null;
  midpointPayRate: number | null;
  marketPayFloor: number | null;
  marketPayConfidence: MarketPayConfidence | null;
  payRecommendationReason: string | null;
  billRateSupportsMarketPay: boolean | null;
} {
  return {
    recommendedPayMin: pay.recommended_w2_pay_min,
    recommendedPayMax: pay.recommended_w2_pay_max,
    midpointPayRate: pay.midpoint_pay_rate,
    marketPayFloor: pay.market_pay_floor,
    marketPayConfidence: pay.market_pay_confidence,
    payRecommendationReason: pay.pay_recommendation_reason,
    billRateSupportsMarketPay: pay.bill_rate_supports_market_pay,
  };
}

export function decimalOrNull(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toString();
}
