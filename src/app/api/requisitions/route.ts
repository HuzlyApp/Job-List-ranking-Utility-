import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listRequisitionsWithAnalysis,
  getDashboardKpis,
  coercePositiveInt,
  type RequisitionListSortBy,
} from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

function optionalQueryParam(value: string | null): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  return value;
}

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  mspProgramId: z.string().uuid().optional(),
  status: z.string().optional(),
  recommendation: z.string().optional(),
  minOpportunityScore: z.coerce.number().min(0).max(100).optional(),
  maxOpportunityScore: z.coerce.number().min(0).max(100).optional(),
  customer: z.string().optional(),
  isNewToday: z.boolean().optional(),
  isNoLongerVisible: z.boolean().optional(),
  negativeProfit: z.boolean().optional(),
  highPriority: z.boolean().optional(),
  payRangeFit: z
    .enum(["Strong Fit", "Workable", "Tight", "Below Market", "Requires Review", "Unavailable"])
    .optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum([
      "opportunityScore",
      "rank",
      "estimatedProfitPerHour",
      "submissionCount",
      "lastSeenAt",
    ])
    .default("rank"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// GET /api/requisitions - List requisitions with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantIdFromQuery = optionalQueryParam(searchParams.get("tenantId"));
    const tenantId =
      tenantIdFromQuery ?? process.env.DEFAULT_TENANT_ID ?? undefined;

    const minScoreRaw = optionalQueryParam(searchParams.get("minOpportunityScore"));
    const maxScoreRaw = optionalQueryParam(searchParams.get("maxOpportunityScore"));

    const params = querySchema.parse({
      tenantId,
      mspProgramId: optionalQueryParam(searchParams.get("mspProgramId")),
      status: optionalQueryParam(searchParams.get("status")),
      recommendation: optionalQueryParam(searchParams.get("recommendation")),
      minOpportunityScore: minScoreRaw,
      maxOpportunityScore: maxScoreRaw,
      customer: optionalQueryParam(searchParams.get("customer")),
      isNewToday: searchParams.has("isNewToday")
        ? searchParams.get("isNewToday") === "true"
        : undefined,
      isNoLongerVisible: searchParams.has("isNoLongerVisible")
        ? searchParams.get("isNoLongerVisible") === "true"
        : undefined,
      negativeProfit: searchParams.has("negativeProfit")
        ? searchParams.get("negativeProfit") === "true"
        : undefined,
      highPriority: searchParams.has("highPriority")
        ? searchParams.get("highPriority") === "true"
        : undefined,
      payRangeFit: optionalQueryParam(searchParams.get("payRangeFit")),
      page: coercePositiveInt(searchParams.get("page"), 1, { min: 1 }),
      limit: coercePositiveInt(searchParams.get("limit"), 20, { min: 1, max: 100 }),
      sortBy: optionalQueryParam(searchParams.get("sortBy")) ?? "rank",
      sortOrder: optionalQueryParam(searchParams.get("sortOrder")) ?? "asc",
    });

    const result = await listRequisitionsWithAnalysis({
      ...params,
      sortBy: params.sortBy as RequisitionListSortBy,
    });

    const kpis = params.tenantId
      ? await getDashboardKpis(params.tenantId, params.mspProgramId)
      : null;

    console.info("[dashboard.fetch]", {
      tenant_id: params.tenantId,
      requisition_count: result.pagination.total,
      returned_rows: result.requisitions.length,
      page: params.page,
    });

    return NextResponse.json({
      ...result,
      kpis,
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
