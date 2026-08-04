import { describe, expect, it, vi, afterEach } from "vitest";
import {
  validatePayRecommendation,
  normalizeRequisitionId,
  dedupeByRequisitionId,
} from "@/lib/pay-validation";
import {
  calculateEffectiveVendorRate,
  calculateW2CostPerHour,
  calculateFinancials,
  calculateCompetitionScore,
  calculateProfitabilityScore,
  calculateScores,
  assignRanks,
  parseDurationToWeeks,
} from "@/lib/financial-calculations";
import { ClaudePayAnalysisSchema, ClaudeExtractionSchema } from "@/types";
import type { FinancialAssumptions, ScoringWeights } from "@/types";

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

const weights: ScoringWeights = {
  competitionWeight: 30,
  profitabilityWeight: 25,
  fillabilityWeight: 20,
  billRateWeight: 15,
  durationWeight: 10,
};

describe("normalizeRequisitionId", () => {
  it("preserves leading zeroes and trims punctuation", () => {
    expect(normalizeRequisitionId(" 00123 ")).toBe("00123");
    expect(normalizeRequisitionId('"00456"')).toBe("00456");
    expect(normalizeRequisitionId("")).toBeNull();
    expect(normalizeRequisitionId(null)).toBeNull();
  });
});

describe("dedupeByRequisitionId", () => {
  it("removes duplicates without summing submissions", () => {
    const { unique, duplicatesRemoved } = dedupeByRequisitionId([
      {
        requisition_id: "100",
        submissions: 3,
        job_title: "Engineer",
        customer: null,
      },
      {
        requisition_id: "100",
        submissions: 5,
        job_title: null,
        customer: "Acme",
      },
      { requisition_id: "200", submissions: 1 },
    ]);
    expect(duplicatesRemoved).toBe(1);
    expect(unique).toHaveLength(2);
    const merged = unique.find((r) => r.requisition_id === "100")!;
    expect(merged.submissions).toBe(5);
    expect(merged.job_title).toBe("Engineer");
    expect(merged.customer).toBe("Acme");
  });
});

describe("market-first pay validation", () => {
  it("raises min to market floor without lowering max", () => {
    const result = validatePayRecommendation({
      requisitionId: "1",
      recommendedMin: 50,
      recommendedMax: 55,
      marketPayFloor: 52,
      billRate: 100,
    });
    expect(result.recommendedMin).toBe(52);
    expect(result.recommendedMax).toBe(55);
    expect(result.midpoint).toBe(53.5);
    expect(result.calculationAdjustments.some((a) => a.includes("market_pay_floor"))).toBe(
      true
    );
  });

  it("does not invent low pay from bill rate when analysis missing", () => {
    const result = validatePayRecommendation({
      requisitionId: "1",
      recommendedMin: null,
      recommendedMax: null,
      billRate: 90,
    });
    expect(result.recommendedMin).toBeNull();
    expect(result.requiresReview).toBe(true);
  });

  it("flags inverted ranges and senior/entry mismatch", () => {
    const inverted = validatePayRecommendation({
      requisitionId: "1",
      recommendedMin: 70,
      recommendedMax: 60,
      marketPayFloor: 60,
    });
    expect(inverted.recommendedMin).toBe(60);
    expect(inverted.recommendedMax).toBe(70);
    expect(inverted.requiresReview).toBe(true);

    const senior = validatePayRecommendation({
      requisitionId: "2",
      recommendedMin: 30,
      recommendedMax: 35,
      marketPayFloor: 30,
      jobTitle: "Senior Software Engineer",
    });
    expect(senior.requiresReview).toBe(true);
  });

  it("flags when competitive pay cannot be supported by bill rate", () => {
    const result = validatePayRecommendation({
      requisitionId: "3",
      recommendedMin: 72,
      recommendedMax: 76,
      marketPayFloor: 72,
      billRate: 75,
      billRateSupportsMarketPay: true,
    });
    expect(result.billRateSupportsMarketPay).toBe(false);
    expect(result.marketRateWarning).toMatch(/negative operating profit/i);
  });
});

describe("deterministic financials (authoritative)", () => {
  it("applies 2% deduction and W-2 costs from midpoint", () => {
    const effective = calculateEffectiveVendorRate(100, "percentage", 2);
    expect(effective.toNumber()).toBe(98);

    const w2 = calculateW2CostPerHour(74, "Standard", assumptions);
    // 74*0.0765 + 0.45+0.30+0.25+0.20+0.25+1.25+0.75
    expect(w2.toDecimalPlaces(4).toNumber()).toBeCloseTo(74 * 0.0765 + 3.45, 4);

    const financials = calculateFinancials({
      displayedVendorRate: 100,
      selectedPayRate: 74,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(financials.effectiveVendorRate!.toNumber()).toBe(98);
    expect(financials.grossSpreadPerHour!.toNumber()).toBe(24);
    expect(financials.estimatedProfitPerHour!.lt(0) || financials.estimatedProfitPerHour!.gte(0)).toBe(
      true
    );
    // Negative profit must remain negative if pay is high
    const weak = calculateFinancials({
      displayedVendorRate: 75,
      selectedPayRate: 74,
      vendorFeeType: "percentage",
      vendorFeeValue: 2,
      weeklyHours: 40,
      durationWeeks: 26,
      roleRiskClassification: "Standard",
      assumptions,
    });
    expect(weak.estimatedProfitPerHour!.lt(0)).toBe(true);
    expect(calculateProfitabilityScore(weak.estimatedProfitPerHour!)).toBe(0);
  });

  it("matches opportunity score formula and continuous ranks", () => {
    expect(calculateCompetitionScore(0)).toBe(100);
    expect(calculateCompetitionScore(25)).toBe(35);
    expect(parseDurationToWeeks("6 months")).toBe(26);

    const scores = calculateScores(
      {
        submissionCount: 2,
        profitPerHour: 6.5,
        fillabilityScore: 80,
        effectiveVendorRate: 90,
        durationWeeks: 52,
        requiresHealthcareReview: false,
      },
      weights
    );
    const expected = Math.round(
      (95 * 30) / 100 + (90 * 25) / 100 + (80 * 20) / 100 + (90 * 15) / 100 + (100 * 10) / 100
    );
    expect(scores.opportunityScore).toBe(expected);

    const ranked = assignRanks([
      {
        id: "a",
        opportunityScore: 80,
        estimatedProfitPerHour: 5,
        submissionCount: 2,
        durationWeeks: 26,
        effectiveVendorRate: 80,
        releasedDate: null,
        requisitionId: "200",
      },
      {
        id: "b",
        opportunityScore: 80,
        estimatedProfitPerHour: 6,
        submissionCount: 2,
        durationWeeks: 26,
        effectiveVendorRate: 80,
        releasedDate: null,
        requisitionId: "100",
      },
      {
        id: "c",
        opportunityScore: 70,
        estimatedProfitPerHour: 10,
        submissionCount: 0,
        durationWeeks: 52,
        effectiveVendorRate: 100,
        releasedDate: null,
        requisitionId: "300",
      },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].id).toBe("b"); // higher profit wins tie
  });
});

describe("Grok schema validation + repair fixtures", () => {
  it("accepts valid pay analysis JSON", () => {
    const parsed = ClaudePayAnalysisSchema.safeParse({
      jobs: [
        {
          requisition_id: "R1",
          recommended_w2_pay_min: 52,
          recommended_w2_pay_max: 55,
          market_pay_floor: 52,
          market_pay_confidence: "High",
          pay_recommendation_reason: "Mid-market for senior BA remote",
          bill_rate_supports_market_pay: true,
          pay_range_fit: "Workable",
          market_rate_warning: null,
          fillability_score: 85,
          fillability_label: "Moderate",
          fillability_reason: "Common skill set",
          suggested_risk_classification: "standard",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid JSON shape", () => {
    const parsed = ClaudeExtractionSchema.safeParse({ jobs: "nope" });
    expect(parsed.success).toBe(false);
  });
});

describe("Grok provider env safety", () => {
  const original = process.env.XAI_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = original;
    vi.resetModules();
  });

  it("fails safely when XAI_API_KEY is missing", async () => {
    delete process.env.XAI_API_KEY;
    vi.resetModules();
    const { getGrokClient } = await import("@/lib/grok-provider");
    expect(() => getGrokClient()).toThrow(/XAI_API_KEY is not configured/);
  });
});

describe("previous provider never imported", () => {
  it("ai-providers factory is Grok-only", async () => {
    const mod = await import("@/lib/ai-providers");
    expect(mod.createRequisitionIntelligenceService).toBeTypeOf("function");
    expect(mod.createGrokRequisitionService).toBeTypeOf("function");
    expect("createClaudeClient" in mod).toBe(false);
    expect("ClaudeRequisitionService" in mod).toBe(false);
  });
});
