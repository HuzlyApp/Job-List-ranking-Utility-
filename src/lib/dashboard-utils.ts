export function coercePositiveInt(
  value: string | null,
  fallback: number,
  opts?: { min?: number; max?: number }
): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const min = opts?.min ?? 1;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function selectEmptyStateKind(input: {
  totalRequisitions: number;
  hasActiveFilters: boolean;
  filteredCount: number;
  latestBatchStatus?: string | null;
}):
  | "first_time"
  | "filtered"
  | "processing"
  | "awaiting_review"
  | "failed"
  | "none" {
  if (input.totalRequisitions > 0) {
    if (input.hasActiveFilters && input.filteredCount === 0) return "filtered";
    return "none";
  }

  const status = input.latestBatchStatus ?? null;
  if (
    status &&
    ["uploaded", "parsing", "extracting", "analyzing", "calculating", "persisting"].includes(
      status
    )
  ) {
    return "processing";
  }
  if (status === "awaiting_review") return "awaiting_review";
  if (status === "failed" || status === "partially_completed") return "failed";
  return "first_time";
}
