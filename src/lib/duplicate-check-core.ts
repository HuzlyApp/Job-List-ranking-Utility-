export const DUPLICATE_STATUSES = [
  "New",
  "Duplicate in Current Import",
  "Already Exists",
  "Existing Record Updated",
  "Possible Duplicate",
  "Conflict Requires Review",
] as const;

export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export interface ExistingRequisitionMatch {
  id: string;
  requisitionId: string;
  status: string | null;
  sourceCustomerName: string | null;
  normalizedCustomerName: string | null;
  jobTitle: string | null;
  location: string | null;
  displayedVendorRate: string | null;
  submissionCount: number | null;
  activeSubmissionCount: number | null;
  sourceDuration: string | null;
  releasedDate: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastAnalyzedAt: Date | null;
  recommendedPayMin: string | null;
  recommendedPayMax: string | null;
}

export interface DuplicateAnnotation {
  duplicateStatus: DuplicateStatus;
  matchedExistingRequisitionId: string | null;
  duplicateMatchReason: string | null;
  existing?: ExistingRequisitionMatch | null;
  batchOccurrenceCount: number;
}

function normalizeKeyPart(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function possibleDuplicateSignature(row: {
  customer?: string | null;
  job_title?: string | null;
  location?: string | null;
  released_date?: string | null;
  c2c_bill_rate?: number | null;
  duration?: string | null;
}): string {
  return [
    normalizeKeyPart(row.customer),
    normalizeKeyPart(row.job_title),
    normalizeKeyPart(row.location),
    normalizeKeyPart(row.released_date),
    row.c2c_bill_rate == null ? "" : String(row.c2c_bill_rate),
    normalizeKeyPart(row.duration),
  ].join("|");
}

export function annotateImportRows<
  T extends {
    requisition_id: string | null;
    customer?: string | null;
    job_title?: string | null;
    location?: string | null;
    released_date?: string | null;
    c2c_bill_rate?: number | null;
    duration?: string | null;
    data_quality_notes?: string[];
  },
>(params: {
  rows: T[];
  existingByReqId: Map<string, ExistingRequisitionMatch>;
  possibleBySignature?: Map<string, ExistingRequisitionMatch[]>;
}): Array<T & { duplicate: DuplicateAnnotation }> {
  const counts = new Map<string, number>();
  for (const row of params.rows) {
    const id = row.requisition_id?.trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return params.rows.map((row) => {
    const reqId = row.requisition_id?.trim() || null;
    const batchOccurrenceCount = reqId ? counts.get(reqId) || 1 : 1;
    const existing = reqId ? params.existingByReqId.get(reqId) : undefined;

    let duplicateStatus: DuplicateStatus = "New";
    let matchedExistingRequisitionId: string | null = null;
    let duplicateMatchReason: string | null = null;

    if (!reqId) {
      const sig = possibleDuplicateSignature(row);
      const possibles = params.possibleBySignature?.get(sig) || [];
      if (possibles.length > 0) {
        duplicateStatus = "Possible Duplicate";
        matchedExistingRequisitionId = possibles[0].id;
        duplicateMatchReason =
          "Missing Requisition ID; similar customer/title/location in Neon";
      }
    } else if (batchOccurrenceCount > 1 && existing) {
      duplicateStatus = "Conflict Requires Review";
      matchedExistingRequisitionId = existing.id;
      duplicateMatchReason =
        "Requisition ID repeats in this import and already exists in Neon";
    } else if (batchOccurrenceCount > 1) {
      duplicateStatus = "Duplicate in Current Import";
      duplicateMatchReason = `Appears ${batchOccurrenceCount} times in this import`;
    } else if (existing) {
      duplicateStatus = "Already Exists";
      matchedExistingRequisitionId = existing.id;
      duplicateMatchReason =
        "Matching tenant + MSP program + Requisition ID in Neon";
    }

    return {
      ...row,
      duplicate: {
        duplicateStatus,
        matchedExistingRequisitionId,
        duplicateMatchReason,
        existing: existing || null,
        batchOccurrenceCount,
      },
    };
  });
}

export function duplicateStatusBadgeClass(status: DuplicateStatus): string {
  switch (status) {
    case "New":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "Duplicate in Current Import":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "Already Exists":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "Existing Record Updated":
      return "bg-green-50 text-green-800 border-green-200";
    case "Possible Duplicate":
      return "bg-amber-50 text-amber-900 border-amber-300";
    case "Conflict Requires Review":
      return "bg-red-50 text-red-800 border-red-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export function summarizeDuplicateAnnotations(
  rows: Array<{
    requisition_id?: string | null;
    duplicate: DuplicateAnnotation;
  }>
): {
  totalSourceRows: number;
  uniqueRequisitionIds: number;
  newRequisitions: number;
  duplicatesInImport: number;
  existingMatches: number;
  existingWithChanges: number;
  possibleDuplicates: number;
  conflicts: number;
  missingRequisitionId: number;
} {
  const uniqueIds = new Set<string>();
  let newRequisitions = 0;
  let duplicatesInImport = 0;
  let existingMatches = 0;
  let existingWithChanges = 0;
  let possibleDuplicates = 0;
  let conflicts = 0;
  let missingRequisitionId = 0;

  for (const row of rows) {
    const id = row.requisition_id?.trim();
    if (id) uniqueIds.add(id);
    else missingRequisitionId += 1;

    const status = row.duplicate.duplicateStatus;
    if (status === "New") newRequisitions += 1;
    if (status === "Duplicate in Current Import") duplicatesInImport += 1;
    if (status === "Already Exists") existingMatches += 1;
    if (status === "Existing Record Updated") {
      existingMatches += 1;
      existingWithChanges += 1;
    }
    if (status === "Possible Duplicate") possibleDuplicates += 1;
    if (status === "Conflict Requires Review") conflicts += 1;
  }

  return {
    totalSourceRows: rows.length,
    uniqueRequisitionIds: uniqueIds.size,
    newRequisitions,
    duplicatesInImport,
    existingMatches,
    existingWithChanges,
    possibleDuplicates,
    conflicts,
    missingRequisitionId,
  };
}
