import { db } from "@/db";
import { requisitions, requisitionAnalysisResults } from "@/db/schema";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  ilike,
  inArray,
  type SQL,
} from "drizzle-orm";

export { coercePositiveInt, selectEmptyStateKind } from "@/lib/dashboard-utils";

export type RequisitionListSortBy =
  | "opportunityScore"
  | "rank"
  | "estimatedProfitPerHour"
  | "submissionCount"
  | "lastSeenAt";

export interface RequisitionListParams {
  tenantId?: string;
  mspProgramId?: string;
  status?: string;
  recommendation?: string;
  minOpportunityScore?: number;
  maxOpportunityScore?: number;
  customer?: string;
  isNewToday?: boolean;
  isNoLongerVisible?: boolean;
  negativeProfit?: boolean;
  highPriority?: boolean;
  page: number;
  limit: number;
  sortBy: RequisitionListSortBy;
  sortOrder: "asc" | "desc";
}

/**
 * Neon HTTP returns row objects keyed by column name without table prefixes.
 * Nested `.select({ requisition: table, analysis: otherTable })` therefore
 * collapses duplicate keys (`id`, `tenant_id`, `requisition_id`) and can yield
 * empty mapped result sets even when COUNT(*) is nonzero.
 *
 * Always select uniquely named columns when joining these tables over neon-http.
 */
export async function listRequisitionsWithAnalysis(params: RequisitionListParams) {
  const offset = Math.max(0, (params.page - 1) * params.limit);
  const whereClause = buildRequisitionWhere(params);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requisitions)
    .leftJoin(
      requisitionAnalysisResults,
      eq(requisitions.id, requisitionAnalysisResults.requisitionId)
    )
    .where(whereClause);

  const sortFn = params.sortOrder === "desc" ? desc : asc;
  const sortColumn =
    params.sortBy === "opportunityScore"
      ? requisitionAnalysisResults.opportunityScore
      : params.sortBy === "rank"
        ? requisitionAnalysisResults.rank
        : params.sortBy === "estimatedProfitPerHour"
          ? requisitionAnalysisResults.estimatedProfitPerHour
          : params.sortBy === "submissionCount"
            ? requisitions.submissionCount
            : requisitions.lastSeenAt;

  const rows = await db
    .select({
      id: requisitions.id,
      tenantId: requisitions.tenantId,
      mspProgramId: requisitions.mspProgramId,
      requisitionId: requisitions.requisitionId,
      status: requisitions.status,
      sourceCustomerName: requisitions.sourceCustomerName,
      normalizedCustomerName: requisitions.normalizedCustomerName,
      jobTitle: requisitions.jobTitle,
      location: requisitions.location,
      startDate: requisitions.startDate,
      sourceDuration: requisitions.sourceDuration,
      normalizedDurationWeeks: requisitions.normalizedDurationWeeks,
      numberOfPositions: requisitions.numberOfPositions,
      submissionCount: requisitions.submissionCount,
      activeSubmissionCount: requisitions.activeSubmissionCount,
      displayedVendorRate: requisitions.displayedVendorRate,
      releasedDate: requisitions.releasedDate,
      positionType: requisitions.positionType,
      remoteOrOnsite: requisitions.remoteOrOnsite,
      sourceConfidence: requisitions.sourceConfidence,
      dataQualityNotes: requisitions.dataQualityNotes,
      firstSeenAt: requisitions.firstSeenAt,
      lastSeenAt: requisitions.lastSeenAt,
      lastAnalyzedAt: requisitions.lastAnalyzedAt,
      isNewToday: requisitions.isNewToday,
      isNoLongerVisible: requisitions.isNoLongerVisible,
      recruiterOwnerId: requisitions.recruiterOwnerId,
      recruitingStatus: requisitions.recruitingStatus,
      notes: requisitions.notes,
      createdAt: requisitions.createdAt,
      updatedAt: requisitions.updatedAt,

      analysisId: requisitionAnalysisResults.id,
      analysisTenantId: requisitionAnalysisResults.tenantId,
      analysisRequisitionFk: requisitionAnalysisResults.requisitionId,
      analysisBatchId: requisitionAnalysisResults.batchId,
      recommendedPayMin: requisitionAnalysisResults.recommendedPayMin,
      recommendedPayMax: requisitionAnalysisResults.recommendedPayMax,
      payMidpoint: requisitionAnalysisResults.payMidpoint,
      selectedPayRate: requisitionAnalysisResults.selectedPayRate,
      payScenario: requisitionAnalysisResults.payScenario,
      payEstimateReason: requisitionAnalysisResults.payEstimateReason,
      marketRateWarning: requisitionAnalysisResults.marketRateWarning,
      roleRiskClassification: requisitionAnalysisResults.roleRiskClassification,
      effectiveVendorRate: requisitionAnalysisResults.effectiveVendorRate,
      estimatedW2Cost: requisitionAnalysisResults.estimatedW2Cost,
      grossSpreadPerHour: requisitionAnalysisResults.grossSpreadPerHour,
      estimatedProfitPerHour: requisitionAnalysisResults.estimatedProfitPerHour,
      netMarginPercent: requisitionAnalysisResults.netMarginPercent,
      weeklyProfit: requisitionAnalysisResults.weeklyProfit,
      assignmentProfit: requisitionAnalysisResults.assignmentProfit,
      competitionScore: requisitionAnalysisResults.competitionScore,
      profitabilityScore: requisitionAnalysisResults.profitabilityScore,
      fillabilityScore: requisitionAnalysisResults.fillabilityScore,
      fillabilityLabel: requisitionAnalysisResults.fillabilityLabel,
      billRateScore: requisitionAnalysisResults.billRateScore,
      durationScore: requisitionAnalysisResults.durationScore,
      opportunityScore: requisitionAnalysisResults.opportunityScore,
      rank: requisitionAnalysisResults.rank,
      calculatedRecommendation: requisitionAnalysisResults.calculatedRecommendation,
      finalRecommendation: requisitionAnalysisResults.finalRecommendation,
      requiresManualReview: requisitionAnalysisResults.requiresManualReview,
      claudeModel: requisitionAnalysisResults.claudeModel,
      promptVersion: requisitionAnalysisResults.promptVersion,
      calculatedAt: requisitionAnalysisResults.calculatedAt,
      analysisUpdatedAt: requisitionAnalysisResults.updatedAt,
    })
    .from(requisitions)
    .leftJoin(
      requisitionAnalysisResults,
      eq(requisitions.id, requisitionAnalysisResults.requisitionId)
    )
    .where(whereClause)
    .orderBy(sortFn(sortColumn), asc(requisitions.requisitionId))
    .limit(params.limit)
    .offset(offset);

  const mapped = (rows as JoinedRequisitionRow[]).map(mapJoinedRow);
  const total = Number(count) || 0;

  return {
    requisitions: mapped,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  };
}

export interface DashboardKpis {
  totalRequisitions: number;
  newToday: number;
  highPriority: number;
  negativeProfit: number;
  noLongerVisible: number;
  averageOpportunityScore: number | null;
}

export async function getDashboardKpis(tenantId: string, mspProgramId?: string): Promise<DashboardKpis> {
  const conditions: SQL[] = [eq(requisitions.tenantId, tenantId)];
  if (mspProgramId) {
    conditions.push(eq(requisitions.mspProgramId, mspProgramId));
  }
  const whereClause = and(...conditions);

  const [row] = await db
    .select({
      totalRequisitions: sql<number>`count(*)::int`,
      newToday: sql<number>`count(*) filter (where ${requisitions.isNewToday} = true)::int`,
      noLongerVisible: sql<number>`count(*) filter (where ${requisitions.isNoLongerVisible} = true)::int`,
      highPriority: sql<number>`count(*) filter (where ${requisitionAnalysisResults.finalRecommendation} in ('Recruit Immediately', 'High Priority'))::int`,
      negativeProfit: sql<number>`count(*) filter (where ${requisitionAnalysisResults.estimatedProfitPerHour} is not null and ${requisitionAnalysisResults.estimatedProfitPerHour}::numeric < 0)::int`,
      averageOpportunityScore: sql<number | null>`avg(${requisitionAnalysisResults.opportunityScore}) filter (where ${requisitionAnalysisResults.opportunityScore} is not null)`,
    })
    .from(requisitions)
    .leftJoin(
      requisitionAnalysisResults,
      eq(requisitions.id, requisitionAnalysisResults.requisitionId)
    )
    .where(whereClause);

  const avg = row?.averageOpportunityScore;
  return {
    totalRequisitions: Number(row?.totalRequisitions) || 0,
    newToday: Number(row?.newToday) || 0,
    highPriority: Number(row?.highPriority) || 0,
    negativeProfit: Number(row?.negativeProfit) || 0,
    noLongerVisible: Number(row?.noLongerVisible) || 0,
    averageOpportunityScore:
      avg === null || avg === undefined ? null : Math.round(Number(avg)),
  };
}

function buildRequisitionWhere(params: RequisitionListParams): SQL | undefined {
  const whereConditions: SQL[] = [];

  if (params.tenantId) {
    whereConditions.push(eq(requisitions.tenantId, params.tenantId));
  }
  if (params.mspProgramId) {
    whereConditions.push(eq(requisitions.mspProgramId, params.mspProgramId));
  }
  if (params.status) {
    whereConditions.push(eq(requisitions.status, params.status));
  }
  if (params.customer) {
    whereConditions.push(
      ilike(requisitions.normalizedCustomerName, `%${params.customer}%`)
    );
  }
  if (params.isNewToday !== undefined) {
    whereConditions.push(eq(requisitions.isNewToday, params.isNewToday));
  }
  if (params.isNoLongerVisible !== undefined) {
    whereConditions.push(
      eq(requisitions.isNoLongerVisible, params.isNoLongerVisible)
    );
  }
  if (params.highPriority) {
    whereConditions.push(
      inArray(requisitionAnalysisResults.finalRecommendation, [
        "Recruit Immediately",
        "High Priority",
      ])
    );
  }
  if (params.negativeProfit) {
    whereConditions.push(
      sql`${requisitionAnalysisResults.estimatedProfitPerHour} is not null and ${requisitionAnalysisResults.estimatedProfitPerHour}::numeric < 0`
    );
  }
  if (params.recommendation) {
    whereConditions.push(
      eq(
        requisitionAnalysisResults.finalRecommendation,
        params.recommendation as
          | "Recruit Immediately"
          | "High Priority"
          | "Good Opportunity"
          | "Candidate Driven"
          | "Only If Candidate Available"
          | "Skip or Monitor"
      )
    );
  }
  if (params.minOpportunityScore !== undefined) {
    whereConditions.push(
      sql`${requisitionAnalysisResults.opportunityScore} >= ${params.minOpportunityScore}`
    );
  }
  if (params.maxOpportunityScore !== undefined) {
    whereConditions.push(
      sql`${requisitionAnalysisResults.opportunityScore} <= ${params.maxOpportunityScore}`
    );
  }

  return whereConditions.length > 0 ? and(...whereConditions) : undefined;
}

type JoinedRequisitionRow = {
  id: string;
  tenantId: string;
  mspProgramId: string;
  requisitionId: string;
  status: string | null;
  sourceCustomerName: string | null;
  normalizedCustomerName: string | null;
  jobTitle: string | null;
  location: string | null;
  startDate: Date | null;
  sourceDuration: string | null;
  normalizedDurationWeeks: string | null;
  numberOfPositions: number | null;
  submissionCount: number | null;
  activeSubmissionCount: number | null;
  displayedVendorRate: string | null;
  releasedDate: Date | null;
  positionType: string | null;
  remoteOrOnsite: string | null;
  sourceConfidence: string;
  dataQualityNotes: unknown;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastAnalyzedAt: Date | null;
  isNewToday: boolean;
  isNoLongerVisible: boolean;
  recruiterOwnerId: string | null;
  recruitingStatus: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  analysisId: string | null;
  analysisTenantId: string | null;
  analysisRequisitionFk: string | null;
  analysisBatchId: string | null;
  recommendedPayMin: string | null;
  recommendedPayMax: string | null;
  payMidpoint: string | null;
  selectedPayRate: string | null;
  payScenario: string | null;
  payEstimateReason: string | null;
  marketRateWarning: string | null;
  roleRiskClassification: string | null;
  effectiveVendorRate: string | null;
  estimatedW2Cost: string | null;
  grossSpreadPerHour: string | null;
  estimatedProfitPerHour: string | null;
  netMarginPercent: string | null;
  weeklyProfit: string | null;
  assignmentProfit: string | null;
  competitionScore: number | null;
  profitabilityScore: number | null;
  fillabilityScore: number | null;
  fillabilityLabel: string | null;
  billRateScore: number | null;
  durationScore: number | null;
  opportunityScore: number | null;
  rank: number | null;
  calculatedRecommendation: string | null;
  finalRecommendation: string | null;
  requiresManualReview: boolean | null;
  claudeModel: string | null;
  promptVersion: string | null;
  calculatedAt: Date | null;
  analysisUpdatedAt: Date | null;
};

function mapJoinedRow(row: JoinedRequisitionRow) {
  const requisition = {
    id: row.id,
    tenantId: row.tenantId,
    mspProgramId: row.mspProgramId,
    requisitionId: row.requisitionId,
    status: row.status,
    sourceCustomerName: row.sourceCustomerName,
    normalizedCustomerName: row.normalizedCustomerName,
    jobTitle: row.jobTitle,
    location: row.location,
    startDate: row.startDate,
    sourceDuration: row.sourceDuration,
    normalizedDurationWeeks: row.normalizedDurationWeeks,
    numberOfPositions: row.numberOfPositions,
    submissionCount: row.submissionCount,
    activeSubmissionCount: row.activeSubmissionCount,
    displayedVendorRate: row.displayedVendorRate,
    releasedDate: row.releasedDate,
    positionType: row.positionType,
    remoteOrOnsite: row.remoteOrOnsite,
    sourceConfidence: row.sourceConfidence,
    dataQualityNotes: row.dataQualityNotes,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lastAnalyzedAt: row.lastAnalyzedAt,
    isNewToday: row.isNewToday,
    isNoLongerVisible: row.isNoLongerVisible,
    recruiterOwnerId: row.recruiterOwnerId,
    recruitingStatus: row.recruitingStatus,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  const analysis =
    row.analysisId == null
      ? null
      : {
          id: row.analysisId,
          tenantId: row.analysisTenantId!,
          requisitionId: row.analysisRequisitionFk!,
          batchId: row.analysisBatchId,
          recommendedPayMin: row.recommendedPayMin,
          recommendedPayMax: row.recommendedPayMax,
          payMidpoint: row.payMidpoint,
          selectedPayRate: row.selectedPayRate,
          payScenario: row.payScenario,
          payEstimateReason: row.payEstimateReason,
          marketRateWarning: row.marketRateWarning,
          roleRiskClassification: row.roleRiskClassification,
          effectiveVendorRate: row.effectiveVendorRate,
          estimatedW2Cost: row.estimatedW2Cost,
          grossSpreadPerHour: row.grossSpreadPerHour,
          estimatedProfitPerHour: row.estimatedProfitPerHour,
          netMarginPercent: row.netMarginPercent,
          weeklyProfit: row.weeklyProfit,
          assignmentProfit: row.assignmentProfit,
          competitionScore: row.competitionScore,
          profitabilityScore: row.profitabilityScore,
          fillabilityScore: row.fillabilityScore,
          fillabilityLabel: row.fillabilityLabel,
          billRateScore: row.billRateScore,
          durationScore: row.durationScore,
          opportunityScore: row.opportunityScore,
          rank: row.rank,
          calculatedRecommendation: row.calculatedRecommendation,
          finalRecommendation: row.finalRecommendation,
          requiresManualReview: Boolean(row.requiresManualReview),
          claudeModel: row.claudeModel,
          promptVersion: row.promptVersion,
          calculatedAt: row.calculatedAt!,
          updatedAt: row.analysisUpdatedAt!,
        };

  return { requisition, analysis };
}
