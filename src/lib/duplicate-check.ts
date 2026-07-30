import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  requisitions,
  requisitionAnalysisResults,
} from "@/db/schema";
import type { ExistingRequisitionMatch } from "@/lib/duplicate-check-core";
import { possibleDuplicateSignature } from "@/lib/duplicate-check-core";

export * from "@/lib/duplicate-check-core";

/** Batch-load existing Neon requisitions by requisition_id (tenant + program scoped). */
export async function findExistingRequisitionsByIds(params: {
  tenantId: string;
  mspProgramId: string;
  requisitionIds: string[];
}): Promise<Map<string, ExistingRequisitionMatch>> {
  const ids = Array.from(
    new Set(params.requisitionIds.map((id) => id.trim()).filter(Boolean))
  );
  const map = new Map<string, ExistingRequisitionMatch>();
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      id: requisitions.id,
      requisitionId: requisitions.requisitionId,
      status: requisitions.status,
      sourceCustomerName: requisitions.sourceCustomerName,
      normalizedCustomerName: requisitions.normalizedCustomerName,
      jobTitle: requisitions.jobTitle,
      location: requisitions.location,
      displayedVendorRate: requisitions.displayedVendorRate,
      submissionCount: requisitions.submissionCount,
      activeSubmissionCount: requisitions.activeSubmissionCount,
      sourceDuration: requisitions.sourceDuration,
      releasedDate: requisitions.releasedDate,
      firstSeenAt: requisitions.firstSeenAt,
      lastSeenAt: requisitions.lastSeenAt,
      lastAnalyzedAt: requisitions.lastAnalyzedAt,
      recommendedPayMin: requisitionAnalysisResults.recommendedPayMin,
      recommendedPayMax: requisitionAnalysisResults.recommendedPayMax,
    })
    .from(requisitions)
    .leftJoin(
      requisitionAnalysisResults,
      eq(requisitions.id, requisitionAnalysisResults.requisitionId)
    )
    .where(
      and(
        eq(requisitions.tenantId, params.tenantId),
        eq(requisitions.mspProgramId, params.mspProgramId),
        inArray(requisitions.requisitionId, ids)
      )
    );

  for (const row of rows) {
    map.set(row.requisitionId, row);
  }
  return map;
}

/** Soft matches for rows missing requisition_id — never auto-merges. */
export async function findPossibleDuplicates(params: {
  tenantId: string;
  mspProgramId: string;
  candidates: Array<{
    customer: string | null;
    job_title: string | null;
    location: string | null;
  }>;
}): Promise<Map<string, ExistingRequisitionMatch[]>> {
  const result = new Map<string, ExistingRequisitionMatch[]>();
  const customers = Array.from(
    new Set(
      params.candidates
        .map((c) => c.customer?.trim())
        .filter((c): c is string => Boolean(c))
    )
  );
  if (customers.length === 0) return result;

  const rows = await db
    .select({
      id: requisitions.id,
      requisitionId: requisitions.requisitionId,
      status: requisitions.status,
      sourceCustomerName: requisitions.sourceCustomerName,
      normalizedCustomerName: requisitions.normalizedCustomerName,
      jobTitle: requisitions.jobTitle,
      location: requisitions.location,
      displayedVendorRate: requisitions.displayedVendorRate,
      submissionCount: requisitions.submissionCount,
      activeSubmissionCount: requisitions.activeSubmissionCount,
      sourceDuration: requisitions.sourceDuration,
      releasedDate: requisitions.releasedDate,
      firstSeenAt: requisitions.firstSeenAt,
      lastSeenAt: requisitions.lastSeenAt,
      lastAnalyzedAt: requisitions.lastAnalyzedAt,
      recommendedPayMin: sql<string | null>`null`,
      recommendedPayMax: sql<string | null>`null`,
    })
    .from(requisitions)
    .where(
      and(
        eq(requisitions.tenantId, params.tenantId),
        eq(requisitions.mspProgramId, params.mspProgramId),
        inArray(requisitions.sourceCustomerName, customers)
      )
    );

  for (const candidate of params.candidates) {
    const sig = possibleDuplicateSignature(candidate);
    const matches = rows.filter((row) => {
      const sameCustomer =
        (row.sourceCustomerName || "").trim().toLowerCase() ===
          (candidate.customer || "").trim().toLowerCase() ||
        (row.normalizedCustomerName || "").trim().toLowerCase() ===
          (candidate.customer || "").trim().toLowerCase();
      const sameTitle =
        (row.jobTitle || "").trim().toLowerCase() ===
        (candidate.job_title || "").trim().toLowerCase();
      const sameLocation =
        !candidate.location ||
        (row.location || "").trim().toLowerCase() ===
          (candidate.location || "").trim().toLowerCase();
      return sameCustomer && sameTitle && sameLocation;
    });
    if (matches.length > 0) {
      result.set(sig, matches as ExistingRequisitionMatch[]);
    }
  }

  return result;
}
