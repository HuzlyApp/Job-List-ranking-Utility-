/**
 * Safe repair for analysis rows persisted with invalid zero pay.
 * Does not invent replacement pay — nulls zeros, clears inflated financials,
 * and marks records for reanalysis.
 */

import { db } from "@/db";
import { requisitionAnalysisResults } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";

export type ZeroPayRepairResult = {
  analysisRowsRepaired: number;
  sourceRowsFlagged: number;
  requisitionsMarkedForReview: number;
};

/**
 * Null out invalid zero pay fields and financials calculated from zero pay.
 * Marks affected records as requiring manual review / reanalysis.
 */
export async function repairInvalidZeroPayRecords(
  tenantId?: string
): Promise<ZeroPayRepairResult> {
  const repaired = await db.execute(sql`
    UPDATE requisition_analysis_results
    SET
      recommended_pay_min = CASE
        WHEN recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0 THEN NULL
        ELSE recommended_pay_min
      END,
      recommended_pay_max = CASE
        WHEN recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0 THEN NULL
        ELSE recommended_pay_max
      END,
      pay_midpoint = CASE
        WHEN pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0 THEN NULL
        ELSE pay_midpoint
      END,
      selected_pay_rate = CASE
        WHEN selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0 THEN NULL
        ELSE selected_pay_rate
      END,
      market_pay_floor = CASE
        WHEN market_pay_floor IS NOT NULL AND market_pay_floor::numeric <= 0 THEN NULL
        ELSE market_pay_floor
      END,
      estimated_w2_cost = NULL,
      gross_spread_per_hour = NULL,
      estimated_profit_per_hour = NULL,
      net_margin_percent = NULL,
      weekly_profit = NULL,
      assignment_profit = NULL,
      profitability_score = NULL,
      pay_range_fit = 'Requires Review',
      requires_manual_review = true,
      pay_estimate_reason = COALESCE(
        NULLIF(pay_estimate_reason, ''),
        'Invalid zero pay cleared; awaiting Grok reanalysis'
      ) || ' [Incomplete - pay recommendation unavailable; zero pay repaired to null]',
      updated_at = NOW()
    WHERE (
      (recommended_pay_min IS NOT NULL AND recommended_pay_min::numeric <= 0)
      OR (recommended_pay_max IS NOT NULL AND recommended_pay_max::numeric <= 0)
      OR (pay_midpoint IS NOT NULL AND pay_midpoint::numeric <= 0)
      OR (selected_pay_rate IS NOT NULL AND selected_pay_rate::numeric <= 0)
    )
    ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
  `);

  const analysisRowsRepaired = Number(
    (repaired as { rowCount?: number }).rowCount ?? 0
  );

  const sourceFlagged = await db.execute(sql`
    UPDATE requisition_source_rows
    SET confirmed_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(confirmed_json, '{}'::jsonb),
          '{requires_pay_review}',
          'true'::jsonb
        ),
        '{recommended_w2_pay_min}',
        'null'::jsonb
      ),
      '{recommended_w2_pay_max}',
      'null'::jsonb
    )
    WHERE confirmed_json IS NOT NULL
      AND (
        confirmed_json->>'recommended_w2_pay_min' IS NULL
        OR confirmed_json->>'recommended_w2_pay_min' IN ('null', '0', '0.00')
        OR confirmed_json->>'recommended_w2_pay_max' IS NULL
        OR confirmed_json->>'recommended_w2_pay_max' IN ('null', '0', '0.00')
        OR confirmed_json->>'pay_estimate_reason' ILIKE '%unavailable%'
      )
    ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
  `);

  const sourceRowsFlagged = Number(
    (sourceFlagged as { rowCount?: number }).rowCount ?? 0
  );

  const reqsMarked = await db.execute(sql`
    UPDATE requisitions r
    SET
      data_quality_notes = COALESCE(data_quality_notes, '[]'::jsonb) ||
        '["Zero pay recommendation cleared; requires Grok reanalysis"]'::jsonb,
      updated_at = NOW()
    WHERE EXISTS (
      SELECT 1 FROM requisition_analysis_results a
      WHERE a.requisition_id = r.id
        AND a.requires_manual_review = true
        AND (
          a.recommended_pay_min IS NULL
          OR a.recommended_pay_max IS NULL
        )
        AND a.pay_estimate_reason ILIKE '%zero pay repaired%'
    )
    ${tenantId ? sql`AND r.tenant_id = ${tenantId}` : sql``}
  `);

  const requisitionsMarkedForReview = Number(
    (reqsMarked as { rowCount?: number }).rowCount ?? 0
  );

  return {
    analysisRowsRepaired,
    sourceRowsFlagged,
    requisitionsMarkedForReview,
  };
}

/** Count currently invalid zero-pay analysis rows (for reporting). */
export async function countInvalidZeroPayRecords(
  tenantId?: string
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(requisitionAnalysisResults)
    .where(
      and(
        tenantId ? eq(requisitionAnalysisResults.tenantId, tenantId) : undefined,
        or(
          sql`${requisitionAnalysisResults.recommendedPayMin}::numeric <= 0`,
          sql`${requisitionAnalysisResults.recommendedPayMax}::numeric <= 0`,
          sql`${requisitionAnalysisResults.payMidpoint}::numeric <= 0`,
          sql`${requisitionAnalysisResults.selectedPayRate}::numeric <= 0`
        )
      )
    );

  return Number(row?.count) || 0;
}
