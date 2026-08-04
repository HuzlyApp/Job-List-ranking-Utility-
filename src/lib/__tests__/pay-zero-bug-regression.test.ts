import { describe, expect, it } from "vitest";
import {
  parseHourlyRate,
  parseCombinedPayRange,
  normalizeGrokPayRecommendation,
  normalizeGrokPayAnalysisPayload,
  calculateDeterministicMidpoint,
  toPayRecommendationCamel,
} from "@/lib/pay-normalization";
import {
  formatPayRange,
  formatPayRate,
  formatMoneyMetric,
  formatPercentMetric,
} from "@/lib/pay-range";
import { validatePayRecommendation } from "@/lib/pay-validation";
import { calculateFinancials } from "@/lib/financial-calculations";
import { ClaudePayAnalysisSchema } from "@/types";
import type { FinancialAssumptions } from "@/types";

const assumptions: FinancialAssumptions = {
  ficaPercent: 7.65,
  futaSutaHourly: 0.45,
  standardWorkersCompHourly: 0.3,
  highRiskWorkersCompHourly: 0.6,
  healthcareWorkersCompHourly: null,
  payrollProcessingHourly: 0.25,
  complianceHourly: 0.2,
  insuranceHourly: 0.25,
  recruitingHourly: 1.25,
  overheadHourly: 0.75,
  benefitsHourly: 0,
  ptoHourly: 0,
  otherHourlyCosts: 0,
};

describe("parseHourlyRate", () => {
  it("accepts valid Grok numeric pay fields", () => {
    expect(parseHourlyRate(72)).toBe(72);
    expect(parseHourlyRate(76.5)).toBe(76.5);
  });

  it("accepts numeric strings", () => {
    expect(parseHourlyRate("72")).toBe(72);
    expect(parseHourlyRate("76.00")).toBe(76);
  });

  it("accepts currency-formatted strings", () => {
    expect(parseHourlyRate("$72")).toBe(72);
    expect(parseHourlyRate("$72/hr")).toBe(72);
    expect(parseHourlyRate("$1,250.50")).toBe(1250.5);
  });

  it("returns null for null, missing, invalid, zero, and negative", () => {
    expect(parseHourlyRate(null)).toBeNull();
    expect(parseHourlyRate(undefined)).toBeNull();
    expect(parseHourlyRate("")).toBeNull();
    expect(parseHourlyRate("n/a")).toBeNull();
    expect(parseHourlyRate("market rate")).toBeNull();
    expect(parseHourlyRate(0)).toBeNull();
    expect(parseHourlyRate("0")).toBeNull();
    expect(parseHourlyRate("$0/hr")).toBeNull();
    expect(parseHourlyRate(-5)).toBeNull();
  });
});

describe("parseCombinedPayRange", () => {
  it("parses supported combined range formats", () => {
    expect(parseCombinedPayRange("$72-$76/hr")).toEqual({ min: 72, max: 76 });
    expect(parseCombinedPayRange("68 – 72")).toEqual({ min: 68, max: 72 });
  });
});

describe("normalizeGrokPayRecommendation", () => {
  it("normalizes canonical numeric fields and deterministic midpoint", () => {
    const pay = normalizeGrokPayRecommendation({
      recommended_w2_pay_min: 68,
      recommended_w2_pay_max: 72,
      market_pay_floor: 65,
      market_pay_confidence: "High",
      pay_recommendation_reason: "Competitive mid-market",
      bill_rate_supports_market_pay: true,
    });
    expect(pay.recommended_w2_pay_min).toBe(68);
    expect(pay.recommended_w2_pay_max).toBe(72);
    expect(pay.midpoint_pay_rate).toBe(70);
    expect(pay.market_pay_floor).toBe(65);
  });

  it("handles currency strings and combined range", () => {
    const fromStrings = normalizeGrokPayRecommendation({
      recommended_w2_pay_min: "$68/hr",
      recommended_w2_pay_max: "$72/hr",
    });
    expect(fromStrings.recommended_w2_pay_min).toBe(68);
    expect(fromStrings.midpoint_pay_rate).toBe(70);

    const fromRange = normalizeGrokPayRecommendation({
      recommended_w2_pay_range: "$68-$72/hr",
    });
    expect(fromRange.recommended_w2_pay_min).toBe(68);
    expect(fromRange.recommended_w2_pay_max).toBe(72);
  });

  it("maps snake_case to camelCase explicitly", () => {
    const pay = normalizeGrokPayRecommendation({
      recommended_w2_pay_min: 68,
      recommended_w2_pay_max: 72,
    });
    expect(toPayRecommendationCamel(pay)).toEqual({
      recommendedPayMin: 68,
      recommendedPayMax: 72,
      midpointPayRate: 70,
      marketPayFloor: null,
      marketPayConfidence: null,
      payRecommendationReason: null,
      billRateSupportsMarketPay: null,
    });
  });

  it("never converts missing/zero to a valid recommendation", () => {
    const empty = normalizeGrokPayRecommendation({});
    expect(empty.recommended_w2_pay_min).toBeNull();
    expect(empty.midpoint_pay_rate).toBeNull();

    const zeros = normalizeGrokPayRecommendation({
      recommended_w2_pay_min: 0,
      recommended_w2_pay_max: 0,
    });
    expect(zeros.recommended_w2_pay_min).toBeNull();
    expect(zeros.recommended_w2_pay_max).toBeNull();
  });
});

describe("normalizeGrokPayAnalysisPayload + Zod", () => {
  it("accepts currency strings after normalization", () => {
    const normalized = normalizeGrokPayAnalysisPayload({
      jobs: [
        {
          requisition_id: "R1",
          recommended_w2_pay_min: "$68/hr",
          recommended_w2_pay_max: "$72/hr",
          market_pay_floor: "$65",
          market_pay_confidence: "Medium",
          pay_recommendation_reason: "Market mid",
          bill_rate_supports_market_pay: true,
          pay_range_fit: "Workable",
          market_rate_warning: null,
          fillability_score: 80,
          fillability_label: "Moderate",
          fillability_reason: "Common skills",
          suggested_risk_classification: "standard",
        },
      ],
    });
    const parsed = ClaudePayAnalysisSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.jobs[0].recommended_w2_pay_min).toBe(68);
      expect(parsed.data.jobs[0].recommended_w2_pay_max).toBe(72);
    }
  });

  it("accepts null pay fields without coercing to zero", () => {
    const parsed = ClaudePayAnalysisSchema.safeParse({
      jobs: [
        {
          requisition_id: "R2",
          recommended_w2_pay_min: null,
          recommended_w2_pay_max: null,
          market_pay_floor: null,
          market_pay_confidence: "Low",
          pay_recommendation_reason: "Insufficient data",
          bill_rate_supports_market_pay: null,
          pay_range_fit: "Requires Review",
          market_rate_warning: null,
          fillability_score: 50,
          fillability_label: "Difficult",
          fillability_reason: "Unknown",
          suggested_risk_classification: "manual_review",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.jobs[0].recommended_w2_pay_min).toBeNull();
      expect(parsed.data.jobs[0].recommended_w2_pay_max).toBeNull();
    }
  });
});

describe("validatePayRecommendation guards", () => {
  it("rejects inverted ranges and pay below market floor", () => {
    const inverted = validatePayRecommendation({
      requisitionId: "1",
      recommendedMin: 76,
      recommendedMax: 72,
      marketPayFloor: 70,
    });
    expect(inverted.recommendedMin).toBe(72);
    expect(inverted.recommendedMax).toBe(76);
    expect(inverted.requiresReview).toBe(true);

    const belowFloor = validatePayRecommendation({
      requisitionId: "2",
      recommendedMin: 60,
      recommendedMax: 64,
      marketPayFloor: 68,
    });
    expect(belowFloor.recommendedMin).toBe(68);
    expect(belowFloor.recommendedMax).toBe(68);
    expect(belowFloor.midpoint).toBe(68); // max raised to min
  });

  it("keeps nulls for zero/missing pay and marks incomplete", () => {
    const zero = validatePayRecommendation({
      requisitionId: "3",
      recommendedMin: 0,
      recommendedMax: 0,
      billRate: 85,
    });
    expect(zero.recommendedMin).toBeNull();
    expect(zero.recommendedMax).toBeNull();
    expect(zero.midpoint).toBeNull();
    expect(zero.calculationStatus).toBe("incomplete_pay_unavailable");
    expect(zero.requiresReview).toBe(true);
  });

  it("calculates deterministic midpoint for regression case $68-$72 → $70", () => {
    const result = validatePayRecommendation({
      requisitionId: "REG",
      recommendedMin: 68,
      recommendedMax: 72,
      marketPayFloor: 68,
      billRate: 85,
    });
    expect(result.midpoint).toBe(70);
    expect(result.calculationStatus).toBe("complete");
  });
});

describe("financial calculation guard", () => {
  it("does not calculate profit when pay is missing or zero", () => {
    const missing = calculateFinancials({
      displayedVendorRate: 85,
      selectedPayRate: null,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(missing.status).toBe("incomplete_pay_unavailable");
    expect(missing.estimatedProfitPerHour).toBeNull();
    expect(missing.netMarginPercent).toBeNull();
    expect(missing.weeklyProfit).toBeNull();

    const zero = calculateFinancials({
      displayedVendorRate: 85,
      selectedPayRate: 0,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(zero.status).toBe("incomplete_pay_unavailable");
  });

  it("produces correct profit for bill $85 and target pay $70", () => {
    const financials = calculateFinancials({
      displayedVendorRate: 85,
      selectedPayRate: 70,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(financials.status).toBe("complete");
    expect(financials.effectiveVendorRate?.toNumber()).toBe(83.3);
    // Profit must be well below the inflated ~$80+ from zero-pay bug
    expect(financials.estimatedProfitPerHour!.toNumber()).toBeLessThan(15);
    expect(financials.estimatedProfitPerHour!.toNumber()).toBeGreaterThan(-20);
    expect(financials.netMarginPercent!.toNumber()).toBeLessThan(30);
  });
});

describe("frontend formatters never show $0 pay", () => {
  it("formatPayRange never returns $0-$0/hr", () => {
    expect(formatPayRange(0, 0)).toBe("Not available");
    expect(formatPayRange("0", "0")).toBe("Not available");
    expect(formatPayRange(null, null)).toBe("Not available");
    expect(formatPayRange(68, null)).toBe("Requires Review");
    expect(formatPayRange(68, 72)).toBe("$68–$72/hr");
  });

  it("formatPayRate never returns $0/hr", () => {
    expect(formatPayRate(0)).toBe("Not available");
    expect(formatPayRate("0")).toBe("Not available");
    expect(formatPayRate(null)).toBe("Not available");
    expect(formatPayRate(70)).toBe("$70/hr");
  });

  it("money/percent metrics handle null", () => {
    expect(formatMoneyMetric(null)).toBe("Not available");
    expect(formatPercentMetric(null)).toBe("Not available");
    expect(formatMoneyMetric("12.5")).toBe("$12.50");
  });
});

describe("regression: $85 bill / $68-$72 pay / $70 target", () => {
  it("end-to-end normalization → validation → financials → display", () => {
    const raw = {
      recommended_w2_pay_min: 68,
      recommended_w2_pay_max: 72,
      market_pay_floor: 68,
      market_pay_confidence: "High",
      pay_recommendation_reason: "Competitive market for this role",
      bill_rate_supports_market_pay: true,
    };
    const normalized = normalizeGrokPayRecommendation(raw);
    expect(normalized.midpoint_pay_rate).toBe(70);

    const validated = validatePayRecommendation({
      requisitionId: "REG-85",
      recommendedMin: normalized.recommended_w2_pay_min,
      recommendedMax: normalized.recommended_w2_pay_max,
      marketPayFloor: normalized.market_pay_floor,
      billRate: 85,
    });
    expect(validated.midpoint).toBe(70);
    expect(validated.calculationStatus).toBe("complete");

    const financials = calculateFinancials({
      displayedVendorRate: 85,
      selectedPayRate: validated.midpoint,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(financials.status).toBe("complete");
    expect(financials.netMarginPercent!.toNumber()).not.toBeCloseTo(95, 0);

    expect(formatPayRange(validated.recommendedMin, validated.recommendedMax)).toBe(
      "$68–$72/hr"
    );
    expect(formatPayRate(validated.midpoint)).toBe("$70/hr");
    expect(formatPayRange(0, 0)).not.toMatch(/\$0/);
    expect(formatPayRate(0)).not.toBe("$0/hr");
  });
});

describe("calculateDeterministicMidpoint", () => {
  it("returns null when either end missing", () => {
    expect(calculateDeterministicMidpoint(68, null)).toBeNull();
    expect(calculateDeterministicMidpoint(null, 72)).toBeNull();
  });
});
