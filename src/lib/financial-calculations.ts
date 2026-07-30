import Decimal from "decimal.js";
import type { FinancialAssumptions, ScoringWeights } from "@/types";

// Configure Decimal for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface RequisitionFinancialInput {
  displayedVendorRate: Decimal | number | null;
  selectedPayRate: Decimal | number;
  vendorFeeType: "percentage" | "flat_hourly" | "none";
  vendorFeeValue: Decimal | number;
  weeklyHours: Decimal | number;
  durationWeeks: Decimal | number | null;
  roleRiskClassification: "Standard" | "Higher-Risk Technical" | "Healthcare" | "Manual Review";
  assumptions: FinancialAssumptions;
}

export interface RequisitionFinancialOutput {
  effectiveVendorRate: Decimal;
  grossSpreadPerHour: Decimal;
  w2CostPerHour: Decimal;
  estimatedProfitPerHour: Decimal;
  netMarginPercent: Decimal;
  weeklyProfit: Decimal;
  assignmentProfit: Decimal | null;
}

export interface RequisitionScoresInput {
  submissionCount: number | null;
  profitPerHour: Decimal | number;
  fillabilityScore: number;
  effectiveVendorRate: Decimal | number;
  durationWeeks: Decimal | number | null;
  requiresHealthcareReview: boolean;
}

export interface RequisitionScoresOutput {
  competitionScore: number;
  profitabilityScore: number;
  fillabilityScore: number;
  billRateScore: number;
  durationScore: number;
  opportunityScore: number;
  rank: number;
}

export interface RankableRequisition {
  id: string;
  opportunityScore: number;
  estimatedProfitPerHour: Decimal | number;
  submissionCount: number | null;
  durationWeeks: Decimal | number | null;
  effectiveVendorRate: Decimal | number;
  releasedDate: Date | string | null;
  requisitionId: string;
}

/**
 * Calculate effective vendor rate after MSP fee
 */
export function calculateEffectiveVendorRate(
  displayedRate: Decimal | number,
  feeType: "percentage" | "flat_hourly" | "none",
  feeValue: Decimal | number
): Decimal {
  const rate = new Decimal(displayedRate);
  const fee = new Decimal(feeValue);

  if (feeType === "percentage") {
    return rate.mul(new Decimal(100).minus(fee)).div(100);
  } else if (feeType === "flat_hourly") {
    return rate.minus(fee);
  }
  return rate;
}

/**
 * Calculate W-2 cost per hour
 */
export function calculateW2CostPerHour(
  payRate: Decimal | number,
  roleRisk: "Standard" | "Higher-Risk Technical" | "Healthcare" | "Manual Review",
  assumptions: FinancialAssumptions
): Decimal {
  const rate = new Decimal(payRate);
  const ficaPercent = new Decimal(assumptions.ficaPercent).div(100);

  let cost = rate.mul(ficaPercent);
  cost = cost.plus(assumptions.futaSutaHourly);
  cost = cost.plus(assumptions.payrollProcessingHourly);
  cost = cost.plus(assumptions.complianceHourly);
  cost = cost.plus(assumptions.insuranceHourly);
  cost = cost.plus(assumptions.recruitingHourly);
  cost = cost.plus(assumptions.overheadHourly);
  cost = cost.plus(assumptions.benefitsHourly);
  cost = cost.plus(assumptions.ptoHourly);
  cost = cost.plus(assumptions.otherHourlyCosts ?? 0);

  if (roleRisk === "Healthcare") {
    throw new Error("Healthcare workers' compensation rate requires manual review");
  } else if (roleRisk === "Higher-Risk Technical") {
    cost = cost.plus(assumptions.highRiskWorkersCompHourly);
  } else {
    cost = cost.plus(assumptions.standardWorkersCompHourly);
  }

  return cost;
}

/**
 * Calculate all financial metrics for a requisition
 */
export function calculateFinancials(
  input: RequisitionFinancialInput
): RequisitionFinancialOutput {
  const {
    displayedVendorRate,
    selectedPayRate,
    vendorFeeType,
    vendorFeeValue,
    weeklyHours,
    durationWeeks,
    roleRiskClassification,
    assumptions,
  } = input;

  if (!displayedVendorRate) {
    throw new Error("Displayed vendor rate is required for financial calculations");
  }

  const effectiveVendorRate = calculateEffectiveVendorRate(
    displayedVendorRate,
    vendorFeeType,
    vendorFeeValue
  );

  const grossSpreadPerHour = effectiveVendorRate.minus(new Decimal(selectedPayRate));

  let w2CostPerHour: Decimal;
  if (roleRiskClassification === "Healthcare") {
    w2CostPerHour = new Decimal(0);
  } else {
    w2CostPerHour = calculateW2CostPerHour(selectedPayRate, roleRiskClassification, assumptions);
  }

  const estimatedProfitPerHour = effectiveVendorRate
    .minus(new Decimal(selectedPayRate))
    .minus(w2CostPerHour);

  const netMarginPercent = effectiveVendorRate.gt(0)
    ? estimatedProfitPerHour.div(effectiveVendorRate).mul(100)
    : new Decimal(0);

  const weeklyProfit = estimatedProfitPerHour.mul(weeklyHours);

  let assignmentProfit: Decimal | null = null;
  if (durationWeeks !== null && durationWeeks !== undefined) {
    assignmentProfit = weeklyProfit.mul(durationWeeks);
  }

  return {
    effectiveVendorRate,
    grossSpreadPerHour,
    w2CostPerHour,
    estimatedProfitPerHour,
    netMarginPercent,
    weeklyProfit,
    assignmentProfit,
  };
}

/**
 * Calculate competition score based on submission count
 */
export function calculateCompetitionScore(submissionCount: number | null): number {
  if (submissionCount === null) return 50;
  if (submissionCount === 0) return 100;
  if (submissionCount >= 1 && submissionCount <= 2) return 95;
  if (submissionCount >= 3 && submissionCount <= 5) return 85;
  if (submissionCount >= 6 && submissionCount <= 10) return 70;
  if (submissionCount >= 11 && submissionCount <= 20) return 50;
  if (submissionCount >= 21 && submissionCount <= 30) return 35;
  return 20;
}

/**
 * Calculate profitability score based on profit per hour
 */
export function calculateProfitabilityScore(profitPerHour: Decimal | number): number {
  const profit = new Decimal(profitPerHour);

  if (profit.gte(8)) return 100;
  if (profit.gte(6)) return 90;
  if (profit.gte(5)) return 82;
  if (profit.gte(4)) return 72;
  if (profit.gte(3)) return 60;
  if (profit.gte(2)) return 45;
  if (profit.gt(0)) return 25;
  return 0;
}

/**
 * Calculate duration score based on assignment duration
 */
export function calculateDurationScore(durationWeeks: Decimal | number | null): number {
  if (durationWeeks === null || durationWeeks === undefined) return 50;

  const weeks = new Decimal(durationWeeks);

  if (weeks.gte(52)) return 100;
  if (weeks.gte(43.3)) return 90;
  if (weeks.gte(26)) return 75;
  if (weeks.gte(21.7)) return 65;
  if (weeks.gte(17.3)) return 55;
  return 40;
}

/**
 * Calculate bill rate score based on effective vendor rate
 */
export function calculateBillRateScore(effectiveVendorRate: Decimal | number): number {
  const rate = new Decimal(effectiveVendorRate);

  if (rate.gte(100)) return 100;
  if (rate.gte(85)) return 90;
  if (rate.gte(75)) return 82;
  if (rate.gte(65)) return 72;
  if (rate.gte(55)) return 60;
  if (rate.gte(45)) return 45;
  return 25;
}

/**
 * Calculate all scores for a requisition
 */
export function calculateScores(
  input: RequisitionScoresInput,
  weights: ScoringWeights
): RequisitionScoresOutput {
  const {
    submissionCount,
    profitPerHour,
    fillabilityScore,
    effectiveVendorRate,
    durationWeeks,
    requiresHealthcareReview,
  } = input;

  const competitionScore = calculateCompetitionScore(submissionCount);
  const profitabilityScore = requiresHealthcareReview ? 0 : calculateProfitabilityScore(profitPerHour);
  const billRateScore = calculateBillRateScore(effectiveVendorRate);
  const durationScore = calculateDurationScore(durationWeeks);

  const totalWeight =
    weights.competitionWeight +
    weights.profitabilityWeight +
    weights.fillabilityWeight +
    weights.billRateWeight +
    weights.durationWeight;

  if (totalWeight !== 100) {
    throw new Error(`Scoring weights must sum to 100, got ${totalWeight}`);
  }

  const opportunityScore = Math.round(
    (competitionScore * weights.competitionWeight) / 100 +
    (profitabilityScore * weights.profitabilityWeight) / 100 +
    (fillabilityScore * weights.fillabilityWeight) / 100 +
    (billRateScore * weights.billRateWeight) / 100 +
    (durationScore * weights.durationWeight) / 100
  );

  return {
    competitionScore,
    profitabilityScore,
    fillabilityScore,
    billRateScore,
    durationScore,
    opportunityScore,
    rank: 0,
  };
}

/**
 * Get recommendation label based on opportunity score
 */
export function getRecommendationLabel(
  opportunityScore: number
):
  | "Recruit Immediately"
  | "High Priority"
  | "Good Opportunity"
  | "Candidate Driven"
  | "Only If Candidate Available"
  | "Skip or Monitor" {
  if (opportunityScore >= 90) return "Recruit Immediately";
  if (opportunityScore >= 80) return "High Priority";
  if (opportunityScore >= 70) return "Good Opportunity";
  if (opportunityScore >= 60) return "Candidate Driven";
  if (opportunityScore >= 50) return "Only If Candidate Available";
  return "Skip or Monitor";
}

/**
 * Get fillability label based on fillability score
 */
export function getFillabilityLabel(fillabilityScore: number): string {
  if (fillabilityScore >= 90) return "Easy";
  if (fillabilityScore >= 70) return "Moderate";
  if (fillabilityScore >= 50) return "Difficult";
  if (fillabilityScore >= 30) return "Very Difficult";
  return "Extremely Difficult";
}

/**
 * Parse duration string to weeks
 */
export function parseDurationToWeeks(duration: string | null): number | null {
  if (!duration) return null;

  const normalized = duration.toLowerCase().trim();

  for (const [pattern, weeks] of Object.entries({
    "4 months": 17.3,
    "5 months": 21.7,
    "6 months": 26,
    "7 months": 30.3,
    "8 months": 34.7,
    "9 months": 39,
    "10 months": 43.3,
    "11 months": 47.7,
    "12 months": 52,
    "1 year": 52,
    "18 months": 78,
    "2 years": 104,
  })) {
    if (normalized.includes(pattern.toLowerCase())) {
      return weeks;
    }
  }

  const monthMatch = normalized.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthMatch) {
    const months = parseFloat(monthMatch[1]);
    return months * 4.333;
  }

  const weekMatch = normalized.match(/(\d+(?:\.\d+)?)\s*weeks?/);
  if (weekMatch) {
    return parseFloat(weekMatch[1]);
  }

  const dayMatch = normalized.match(/(\d+)\s*days?/);
  if (dayMatch) {
    return parseInt(dayMatch[1]) / 7;
  }

  return null;
}

/**
 * Assign ranks to requisitions based on opportunity score and deterministic tie-breakers.
 * Tie-breakers:
 * 1. Higher profit per hour
 * 2. Fewer submissions
 * 3. Longer duration
 * 4. Higher effective vendor rate
 * 5. Earlier release date
 * 6. Stable Requisition ID ordering (ascending)
 */
export function assignRanks<T extends RankableRequisition>(
  requisitions: T[]
): Array<T & { rank: number }> {
  const sorted = [...requisitions].sort((a, b) => {
    if (b.opportunityScore !== a.opportunityScore) {
      return b.opportunityScore - a.opportunityScore;
    }

    const profitA = new Decimal(a.estimatedProfitPerHour || 0);
    const profitB = new Decimal(b.estimatedProfitPerHour || 0);
    if (!profitB.eq(profitA)) {
      return profitB.sub(profitA).toNumber();
    }

    const subsA = a.submissionCount ?? Number.MAX_SAFE_INTEGER;
    const subsB = b.submissionCount ?? Number.MAX_SAFE_INTEGER;
    if (subsA !== subsB) {
      return subsA - subsB;
    }

    const durA = new Decimal(a.durationWeeks ?? 0);
    const durB = new Decimal(b.durationWeeks ?? 0);
    if (!durB.eq(durA)) {
      return durB.sub(durA).toNumber();
    }

    const rateA = new Decimal(a.effectiveVendorRate || 0);
    const rateB = new Decimal(b.effectiveVendorRate || 0);
    if (!rateB.eq(rateA)) {
      return rateB.sub(rateA).toNumber();
    }

    const dateA = a.releasedDate ? new Date(a.releasedDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dateB = b.releasedDate ? new Date(b.releasedDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (dateA !== dateB) {
      return dateA - dateB;
    }

    return (a.requisitionId || "").localeCompare(b.requisitionId || "");
  });

  return sorted.map((req, index) => ({
    ...req,
    rank: index + 1,
  }));
}
