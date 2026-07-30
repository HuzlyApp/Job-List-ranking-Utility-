import { db } from "@/db";
import {
  auditLogs,
  claudeRequestLogs,
  customerAliases,
  requisitionAnalysisBatches,
  requisitionAnalysisResults,
  requisitionOverrides,
  requisitionSnapshots,
  requisitionSourceFiles,
  requisitionSourceRows,
  requisitions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  type ClearScope,
  resolveEffectiveScopes,
} from "@/lib/clear-data-scopes";

export type { ClearScope } from "@/lib/clear-data-scopes";
export { CLEAR_SCOPES, resolveEffectiveScopes } from "@/lib/clear-data-scopes";

export type ClearCounts = {
  claudeRequestLogs: number;
  auditLogs: number;
  requisitionOverrides: number;
  requisitionAnalysisResults: number;
  requisitionSnapshots: number;
  requisitionSourceRows: number;
  requisitionSourceFiles: number;
  requisitions: number;
  requisitionAnalysisBatches: number;
  customerAliases: number;
};

function emptyCounts(): ClearCounts {
  return {
    claudeRequestLogs: 0,
    auditLogs: 0,
    requisitionOverrides: 0,
    requisitionAnalysisResults: 0,
    requisitionSnapshots: 0,
    requisitionSourceRows: 0,
    requisitionSourceFiles: 0,
    requisitions: 0,
    requisitionAnalysisBatches: 0,
    customerAliases: 0,
  };
}

async function countTenant(
  countQuery: Promise<{ count: number }[]>
): Promise<number> {
  const [row] = await countQuery;
  return Number(row?.count) || 0;
}

/**
 * Clears tenant operational data by scope.
 * Preserves seed configuration (tenants, users, msp_programs, assumptions, weights).
 */
export async function clearTenantData(
  tenantId: string,
  scopes: ClearScope[]
): Promise<{ scopes: ClearScope[]; deleted: ClearCounts }> {
  const unique = resolveEffectiveScopes(scopes);
  const includeAll = unique.includes("all");
  const clearImports = includeAll || unique.includes("imports");
  const clearRequisitions = includeAll || unique.includes("requisitions");
  const clearAudit = includeAll || unique.includes("audit");
  const clearAliases = includeAll || unique.includes("aliases");

  const deleted = emptyCounts();

  if (clearImports && !clearRequisitions) {
    await db
      .update(requisitionAnalysisResults)
      .set({ batchId: null })
      .where(eq(requisitionAnalysisResults.tenantId, tenantId));

    deleted.requisitionSnapshots = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionSnapshots)
        .where(eq(requisitionSnapshots.tenantId, tenantId))
    );
    if (deleted.requisitionSnapshots > 0) {
      await db
        .delete(requisitionSnapshots)
        .where(eq(requisitionSnapshots.tenantId, tenantId));
    }
  }

  if (clearImports) {
    deleted.claudeRequestLogs = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(claudeRequestLogs)
        .where(eq(claudeRequestLogs.tenantId, tenantId))
    );
    if (deleted.claudeRequestLogs > 0) {
      await db
        .delete(claudeRequestLogs)
        .where(eq(claudeRequestLogs.tenantId, tenantId));
    }

    deleted.requisitionSourceRows = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionSourceRows)
        .where(eq(requisitionSourceRows.tenantId, tenantId))
    );
    if (deleted.requisitionSourceRows > 0) {
      await db
        .delete(requisitionSourceRows)
        .where(eq(requisitionSourceRows.tenantId, tenantId));
    }

    deleted.requisitionSourceFiles = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionSourceFiles)
        .where(eq(requisitionSourceFiles.tenantId, tenantId))
    );
    if (deleted.requisitionSourceFiles > 0) {
      await db
        .delete(requisitionSourceFiles)
        .where(eq(requisitionSourceFiles.tenantId, tenantId));
    }
  }

  if (clearRequisitions) {
    deleted.requisitionOverrides = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionOverrides)
        .where(eq(requisitionOverrides.tenantId, tenantId))
    );
    if (deleted.requisitionOverrides > 0) {
      await db
        .delete(requisitionOverrides)
        .where(eq(requisitionOverrides.tenantId, tenantId));
    }

    deleted.requisitionAnalysisResults = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionAnalysisResults)
        .where(eq(requisitionAnalysisResults.tenantId, tenantId))
    );
    if (deleted.requisitionAnalysisResults > 0) {
      await db
        .delete(requisitionAnalysisResults)
        .where(eq(requisitionAnalysisResults.tenantId, tenantId));
    }

    if (deleted.requisitionSnapshots === 0) {
      deleted.requisitionSnapshots = await countTenant(
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(requisitionSnapshots)
          .where(eq(requisitionSnapshots.tenantId, tenantId))
      );
      if (deleted.requisitionSnapshots > 0) {
        await db
          .delete(requisitionSnapshots)
          .where(eq(requisitionSnapshots.tenantId, tenantId));
      }
    }

    deleted.requisitions = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitions)
        .where(eq(requisitions.tenantId, tenantId))
    );
    if (deleted.requisitions > 0) {
      await db.delete(requisitions).where(eq(requisitions.tenantId, tenantId));
    }
  }

  if (clearImports) {
    deleted.requisitionAnalysisBatches = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(requisitionAnalysisBatches)
        .where(eq(requisitionAnalysisBatches.tenantId, tenantId))
    );
    if (deleted.requisitionAnalysisBatches > 0) {
      await db
        .delete(requisitionAnalysisBatches)
        .where(eq(requisitionAnalysisBatches.tenantId, tenantId));
    }
  }

  if (clearAudit) {
    deleted.auditLogs = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, tenantId))
    );
    if (deleted.auditLogs > 0) {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
    }
  }

  if (clearAliases) {
    deleted.customerAliases = await countTenant(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(customerAliases)
        .where(eq(customerAliases.tenantId, tenantId))
    );
    if (deleted.customerAliases > 0) {
      await db
        .delete(customerAliases)
        .where(eq(customerAliases.tenantId, tenantId));
    }
  }

  console.info("[data.clear]", {
    tenant_id: tenantId,
    scopes: unique,
    deleted,
  });

  return { scopes: unique, deleted };
}
