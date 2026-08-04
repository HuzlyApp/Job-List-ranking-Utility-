import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateEffectiveVendorRate,
  calculateW2CostPerHour,
  calculateFinancials,
  calculateCompetitionScore,
  calculateProfitabilityScore,
  calculateDurationScore,
  calculateBillRateScore,
  calculateScores,
  getRecommendationLabel,
  getFillabilityLabel,
  parseDurationToWeeks,
} from "../financial-calculations";

describe("Financial Calculations", () => {
  describe("calculateEffectiveVendorRate", () => {
    it("should calculate effective rate with percentage fee", () => {
      const result = calculateEffectiveVendorRate(100, "percentage", 2);
      expect(result.toNumber()).toBe(98);
    });

    it("should calculate effective rate with flat hourly fee", () => {
      const result = calculateEffectiveVendorRate(100, "flat_hourly", 5);
      expect(result.toNumber()).toBe(95);
    });

    it("should return same rate with no fee", () => {
      const result = calculateEffectiveVendorRate(100, "none", 0);
      expect(result.toNumber()).toBe(100);
    });
  });

  describe("calculateW2CostPerHour", () => {
    const assumptions = {
      ficaPercent: 7.65,
      futaSutaHourly: 0.45,
      standardWorkersCompHourly: 0.30,
      highRiskWorkersCompHourly: 0.60,
      healthcareWorkersCompHourly: null,
      payrollProcessingHourly: 0.25,
      complianceHourly: 0.20,
      insuranceHourly: 0.25,
      recruitingHourly: 1.25,
      overheadHourly: 0.75,
      benefitsHourly: 0.0,
      ptoHourly: 0.0,
      otherHourlyCosts: 0.0,
    };

    it("should calculate W-2 cost for standard role", () => {
      const result = calculateW2CostPerHour(80, "Standard", assumptions);
      // 80 * 0.0765 = 6.12 (FICA)
      // + 0.45 (FUTA/SUTA) = 6.57
      // + 0.30 (workers comp) = 6.87
      // + 0.25 (payroll) = 7.12
      // + 0.20 (compliance) = 7.32
      // + 0.25 (insurance) = 7.57
      // + 1.25 (recruiting) = 8.82
      // + 0.75 (overhead) = 9.57
      expect(result.toNumber()).toBeCloseTo(9.57, 2);
    });

    it("should calculate W-2 cost for high-risk role", () => {
      const result = calculateW2CostPerHour(80, "Higher-Risk Technical", assumptions);
      // Same as standard but with 0.60 workers comp
      // 6.12 + 0.45 + 0.60 + 0.25 + 0.20 + 0.25 + 1.25 + 0.75 = 9.87
      expect(result.toNumber()).toBeCloseTo(9.87, 2);
    });

    it("should throw error for healthcare role", () => {
      expect(() => {
        calculateW2CostPerHour(80, "Healthcare", assumptions);
      }).toThrow("Healthcare workers' compensation rate requires manual review");
    });
  });

  describe("calculateFinancials", () => {
    const assumptions = {
      ficaPercent: 7.65,
      futaSutaHourly: 0.45,
      standardWorkersCompHourly: 0.30,
      highRiskWorkersCompHourly: 0.60,
      healthcareWorkersCompHourly: null,
      payrollProcessingHourly: 0.25,
      complianceHourly: 0.20,
      insuranceHourly: 0.25,
      recruitingHourly: 1.25,
      overheadHourly: 0.75,
      benefitsHourly: 0.0,
      ptoHourly: 0.0,
      otherHourlyCosts: 0.0,
    };

    it("should calculate all financial metrics", () => {
      const input = {
        displayedVendorRate: 100,
        selectedPayRate: 80,
        vendorFeeType: "percentage" as const,
        vendorFeeValue: 2,
        weeklyHours: 40,
        durationWeeks: 26,
        roleRiskClassification: "Standard" as const,
        assumptions,
      };

      const result = calculateFinancials(input);

      expect(result.status).toBe("complete");
      expect(result.effectiveVendorRate!.toNumber()).toBe(98);
      expect(result.grossSpreadPerHour!.toNumber()).toBe(18);
      expect(result.estimatedProfitPerHour!.toNumber()).toBeCloseTo(8.43, 2);
      expect(result.netMarginPercent!.toNumber()).toBeCloseTo(8.6, 1);
      expect(result.weeklyProfit!.toNumber()).toBeCloseTo(337.2, 1);
      expect(result.assignmentProfit?.toNumber()).toBeCloseTo(8767.2, 1);
    });

    it("should return null assignment profit when duration is unknown", () => {
      const input = {
        displayedVendorRate: 100,
        selectedPayRate: 80,
        vendorFeeType: "percentage" as const,
        vendorFeeValue: 2,
        weeklyHours: 40,
        durationWeeks: null,
        roleRiskClassification: "Standard" as const,
        assumptions,
      };

      const result = calculateFinancials(input);
      expect(result.status).toBe("complete");
      expect(result.assignmentProfit).toBeNull();
    });

    it("should not calculate when pay rate is missing", () => {
      const result = calculateFinancials({
        displayedVendorRate: 100,
        selectedPayRate: null,
        vendorFeeType: "percentage",
        vendorFeeValue: 2,
        weeklyHours: 40,
        durationWeeks: 26,
        roleRiskClassification: "Standard",
        assumptions,
      });
      expect(result.status).toBe("incomplete_pay_unavailable");
      expect(result.estimatedProfitPerHour).toBeNull();
    });
  });

  describe("calculateCompetitionScore", () => {
    it("should return 100 for 0 submissions", () => {
      expect(calculateCompetitionScore(0)).toBe(100);
    });

    it("should return 50 for 1-2 submissions", () => {
      expect(calculateCompetitionScore(1)).toBe(95);
      expect(calculateCompetitionScore(2)).toBe(95);
    });

    it("should return 50 for unknown submission count", () => {
      expect(calculateCompetitionScore(null)).toBe(50);
    });

    it("should return 20 for more than 30 submissions", () => {
      expect(calculateCompetitionScore(31)).toBe(20);
      expect(calculateCompetitionScore(100)).toBe(20);
    });
  });

  describe("calculateProfitabilityScore", () => {
    it("should return 100 for $8.00 or more profit", () => {
      expect(calculateProfitabilityScore(8)).toBe(100);
      expect(calculateProfitabilityScore(10)).toBe(100);
    });

    it("should return 90 for $6.00-$7.99 profit", () => {
      expect(calculateProfitabilityScore(6)).toBe(90);
      expect(calculateProfitabilityScore(7.5)).toBe(90);
    });

    it("should return 0 for $0 or negative profit", () => {
      expect(calculateProfitabilityScore(0)).toBe(0);
      expect(calculateProfitabilityScore(-5)).toBe(0);
    });
  });

  describe("calculateDurationScore", () => {
    it("should return 100 for 12+ months", () => {
      expect(calculateDurationScore(52)).toBe(100);
      expect(calculateDurationScore(60)).toBe(100);
    });

    it("should return 55 for 4 months", () => {
      expect(calculateDurationScore(17.3)).toBe(55);
    });

    it("should return 50 for unknown duration", () => {
      expect(calculateDurationScore(null)).toBe(50);
    });
  });

  describe("calculateBillRateScore", () => {
    it("should return 100 for $100 or more", () => {
      expect(calculateBillRateScore(100)).toBe(100);
      expect(calculateBillRateScore(150)).toBe(100);
    });

    it("should return 25 for below $45", () => {
      expect(calculateBillRateScore(44)).toBe(25);
      expect(calculateBillRateScore(30)).toBe(25);
    });

    it("should return 90 for $85-$99.99", () => {
      expect(calculateBillRateScore(90)).toBe(90);
      expect(calculateBillRateScore(85)).toBe(90);
    });
  });

  describe("calculateScores", () => {
    it("should calculate opportunity score with default weights", () => {
      const input = {
        submissionCount: 5,
        profitPerHour: 5,
        fillabilityScore: 70,
        effectiveVendorRate: 80,
        durationWeeks: 26,
        requiresHealthcareReview: false,
      };

      const weights = {
        competitionWeight: 30,
        profitabilityWeight: 25,
        fillabilityWeight: 20,
        billRateWeight: 15,
        durationWeight: 10,
      };

      const result = calculateScores(input, weights);

      expect(result.competitionScore).toBe(85);
      expect(result.profitabilityScore).toBe(82);
      expect(result.fillabilityScore).toBe(70);
      // 80 is in $75-$84.99 range, which should give 82
      expect(result.billRateScore).toBe(82);
      expect(result.durationScore).toBe(75);
      
      // Calculate weighted score with updated bill rate score
      const expected = Math.round(
        (85 * 30 + 82 * 25 + 70 * 20 + 82 * 15 + 75 * 10) / 100
      );
      expect(result.opportunityScore).toBe(expected);
    });

    it("should throw error if weights don't sum to 100", () => {
      const input = {
        submissionCount: 5,
        profitPerHour: 5,
        fillabilityScore: 70,
        effectiveVendorRate: 80,
        durationWeeks: 26,
        requiresHealthcareReview: false,
      };

      const weights = {
        competitionWeight: 30,
        profitabilityWeight: 30,
        fillabilityWeight: 30,
        billRateWeight: 15,
        durationWeight: 10,
      };

      expect(() => calculateScores(input, weights)).toThrow();
    });
  });

  describe("getRecommendationLabel", () => {
    it("should return correct labels", () => {
      expect(getRecommendationLabel(95)).toBe("Recruit Immediately");
      expect(getRecommendationLabel(85)).toBe("High Priority");
      expect(getRecommendationLabel(75)).toBe("Good Opportunity");
      expect(getRecommendationLabel(65)).toBe("Candidate Driven");
      expect(getRecommendationLabel(55)).toBe("Only If Candidate Available");
      expect(getRecommendationLabel(45)).toBe("Skip or Monitor");
    });
  });

  describe("getFillabilityLabel", () => {
    it("should return correct labels", () => {
      expect(getFillabilityLabel(95)).toBe("Easy");
      expect(getFillabilityLabel(80)).toBe("Moderate");
      expect(getFillabilityLabel(60)).toBe("Difficult");
      expect(getFillabilityLabel(40)).toBe("Very Difficult");
      expect(getFillabilityLabel(20)).toBe("Extremely Difficult");
    });
  });

  describe("parseDurationToWeeks", () => {
    it("should parse 4 months", () => {
      expect(parseDurationToWeeks("4 months")).toBe(17.3);
    });

    it("should parse 6 months", () => {
      expect(parseDurationToWeeks("6 months")).toBe(26);
    });

    it("should parse 12 months", () => {
      expect(parseDurationToWeeks("12 months")).toBe(52);
    });

    it("should parse explicit weeks", () => {
      expect(parseDurationToWeeks("26 weeks")).toBe(26);
    });

    it("should parse 1 year", () => {
      expect(parseDurationToWeeks("1 year")).toBe(52);
    });

    it("should return null for unknown duration", () => {
      expect(parseDurationToWeeks("unknown")).toBeNull();
      expect(parseDurationToWeeks(null)).toBeNull();
    });
  });
});
