import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  requisitions,
  requisitionAnalysisResults,
  requisitionOverrides,
} from "@/db/schema";
import { eq, and, desc, asc, sql, type SQL } from "drizzle-orm";

function optionalQueryParam(value: string | null): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  return value;
}

const querySchema = z.object({
  tenantId: z
    .preprocess(optionalQueryParam, z.string().uuid().optional())
    .optional(),
  mspProgramId: z
    .preprocess(optionalQueryParam, z.string().uuid().optional())
    .optional(),
  status: z.preprocess(optionalQueryParam, z.string().optional()).optional(),
  recommendation: z
    .preprocess(optionalQueryParam, z.string().optional())
    .optional(),
  minOpportunityScore: z.coerce.number().min(0).max(100).optional(),
  maxOpportunityScore: z.coerce.number().min(0).max(100).optional(),
  customer: z.preprocess(optionalQueryParam, z.string().optional()).optional(),
  isNewToday: z.boolean().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
  sortBy: z
    .preprocess(
      optionalQueryParam,
      z
        .enum([
          "opportunityScore",
          "rank",
          "estimatedProfitPerHour",
          "submissionCount",
          "lastSeenAt",
        ])
        .default("rank")
    )
    .default("rank"),
  sortOrder: z
    .preprocess(
      optionalQueryParam,
      z.enum(["asc", "desc"]).default("asc")
    )
    .default("asc"),
});

// GET /api/requisitions - List requisitions with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantIdFromQuery = optionalQueryParam(searchParams.get("tenantId"));
    const tenantId =
      tenantIdFromQuery ?? process.env.DEFAULT_TENANT_ID ?? undefined;

    const params = querySchema.parse({
      tenantId,
      mspProgramId: searchParams.get("mspProgramId"),
      status: searchParams.get("status"),
      recommendation: searchParams.get("recommendation"),
      minOpportunityScore: searchParams.get("minOpportunityScore"),
      maxOpportunityScore: searchParams.get("maxOpportunityScore"),
      customer: searchParams.get("customer"),
      isNewToday: searchParams.has("isNewToday")
        ? searchParams.get("isNewToday") === "true"
        : undefined,
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
      sortBy: searchParams.get("sortBy"),
      sortOrder: searchParams.get("sortOrder"),
    });

    const offset = (params.page - 1) * params.limit;

    // Build query
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
        sql`${requisitions.normalizedCustomerName} ILIKE ${`%${params.customer}%`}`
      );
    }

    if (params.isNewToday !== undefined) {
      whereConditions.push(eq(requisitions.isNewToday, params.isNewToday));
    }

    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(requisitions)
      .where(whereClause);

    // Build sort
    const sortColumn =
      params.sortBy === "opportunityScore"
        ? requisitionAnalysisResults.opportunityScore
        : params.sortBy === "rank"
        ? requisitionAnalysisResults.rank
        : params.sortBy === "estimatedProfitPerHour"
        ? requisitionAnalysisResults.estimatedProfitPerHour
        : requisitions.lastSeenAt;

    const sortFn = params.sortOrder === "desc" ? desc : asc;

    // Get requisitions with results
    const results = await db
      .select({
        requisition: requisitions,
        analysis: requisitionAnalysisResults,
      })
      .from(requisitions)
      .leftJoin(
        requisitionAnalysisResults,
        eq(requisitions.id, requisitionAnalysisResults.requisitionId)
      )
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(params.limit)
      .offset(offset);

    // Filter by opportunity score if specified
    let filtered = results;
    if (params.minOpportunityScore !== undefined || params.maxOpportunityScore !== undefined) {
      filtered = results.filter((r) => {
        const score = r.analysis?.opportunityScore;
        if (score === null || score === undefined) return true;
        if (params.minOpportunityScore !== undefined && score < params.minOpportunityScore) {
          return false;
        }
        if (params.maxOpportunityScore !== undefined && score > params.maxOpportunityScore) {
          return false;
        }
        return true;
      });
    }

    // Filter by recommendation if specified
    if (params.recommendation) {
      filtered = filtered.filter((r) =>
        r.analysis?.finalRecommendation === params.recommendation
      );
    }

    return NextResponse.json({
      requisitions: filtered,
      pagination: {
        total: count,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(count / params.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching requisitions:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to fetch requisitions" },
      { status: 500 }
    );
  }
}
