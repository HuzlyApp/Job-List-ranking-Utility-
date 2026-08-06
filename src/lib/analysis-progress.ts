export type AnalysisProgressStage =
  | "queued"
  | "loading_rows"
  | "analyzing_grok"
  | "validating"
  | "persisting_chunk"
  | "calculating"
  | "complete"
  | "failed";

export type AnalysisProgressSnapshot = {
  stage: AnalysisProgressStage;
  currentStage: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  totalChunks: number;
  completedChunks: number;
  currentChunk: number;
  selectedModel: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  estimatedCompletionAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  /** Monotonic percent from persisted terminal rows only */
  progressPercent: number;
  /** Legacy aliases used by existing UI */
  analyzed: number;
  total: number;
};

export type AnalysisPerfCounters = {
  promptBuildMsTotal: number;
  modelLatencyMsTotal: number;
  modelLatencyMsMax: number;
  parseLatencyMsTotal: number;
  databaseLatencyMsTotal: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  modelRequestCount: number;
  retryCount: number;
  sequential: boolean;
  concurrency: number;
  chunkSize: number;
};

export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeProgressPercent(
  processedRows: number,
  totalRows: number
): number {
  if (totalRows <= 0) return 0;
  return clampProgressPercent((processedRows / totalRows) * 100);
}

export function stageLabel(stage: AnalysisProgressStage): string {
  switch (stage) {
    case "queued":
      return "Queued for analysis";
    case "loading_rows":
      return "Loading requisitions";
    case "analyzing_grok":
      return "Evaluating requisitions";
    case "validating":
      return "Validating model responses";
    case "persisting_chunk":
      return "Saving analysis results";
    case "calculating":
      return "Calculating scores and ranks";
    case "complete":
      return "Analysis complete";
    case "failed":
      return "Analysis failed";
    default:
      return "Processing";
  }
}

export function emptyProgress(
  overrides?: Partial<AnalysisProgressSnapshot>
): AnalysisProgressSnapshot {
  return {
    stage: "queued",
    currentStage: stageLabel("queued"),
    totalRows: 0,
    processedRows: 0,
    successfulRows: 0,
    failedRows: 0,
    totalChunks: 0,
    completedChunks: 0,
    currentChunk: 0,
    selectedModel: null,
    startedAt: null,
    lastActivityAt: null,
    estimatedCompletionAt: null,
    completedAt: null,
    lastError: null,
    progressPercent: 0,
    analyzed: 0,
    total: 0,
    ...overrides,
  };
}

/**
 * Merge a progress patch while enforcing monotonic processed/success/fail counts
 * and never-decreasing progressPercent.
 */
export function mergeProgress(
  previous: AnalysisProgressSnapshot | null | undefined,
  patch: Partial<AnalysisProgressSnapshot>
): AnalysisProgressSnapshot {
  const base = previous ?? emptyProgress();
  const totalRows = patch.totalRows ?? base.totalRows;
  const processedRows = Math.max(
    base.processedRows,
    patch.processedRows ?? base.processedRows
  );
  const successfulRows = Math.max(
    base.successfulRows,
    patch.successfulRows ?? base.successfulRows
  );
  const failedRows = Math.max(
    base.failedRows,
    patch.failedRows ?? base.failedRows
  );
  const completedChunks = Math.max(
    base.completedChunks,
    patch.completedChunks ?? base.completedChunks
  );
  const progressPercent = Math.max(
    base.progressPercent,
    patch.progressPercent ??
      computeProgressPercent(processedRows, totalRows)
  );

  const stage = patch.stage ?? base.stage;
  return {
    ...base,
    ...patch,
    stage,
    currentStage: patch.currentStage ?? stageLabel(stage),
    totalRows,
    processedRows,
    successfulRows,
    failedRows,
    completedChunks,
    progressPercent,
    analyzed: processedRows,
    total: totalRows,
  };
}

export function estimateCompletionIso(
  startedAt: string | null,
  processedRows: number,
  totalRows: number,
  now = Date.now()
): string | null {
  if (!startedAt || processedRows <= 0 || totalRows <= processedRows) {
    return null;
  }
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs) || startedMs <= 0) return null;
  const elapsed = now - startedMs;
  if (elapsed < 5_000) return null;
  const msPerRow = elapsed / processedRows;
  const remaining = msPerRow * (totalRows - processedRows);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  // Mild smoothing: clamp remaining to a reasonable band
  const smoothed = Math.min(Math.max(remaining, 5_000), 60 * 60_000);
  return new Date(now + smoothed).toISOString();
}

export function buildPerfSummary(input: {
  batchId: string;
  totalElapsedMs: number;
  counters: AnalysisPerfCounters;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
}) {
  const {
    totalElapsedMs,
    counters,
    totalRows,
    successfulRows,
    failedRows,
    batchId,
  } = input;
  const avgModelLatency =
    counters.modelRequestCount > 0
      ? Math.round(counters.modelLatencyMsTotal / counters.modelRequestCount)
      : 0;
  const rowsPerMinute =
    totalElapsedMs > 0
      ? Math.round((successfulRows / totalElapsedMs) * 60_000 * 10) / 10
      : 0;

  const stages = [
    { name: "model", ms: counters.modelLatencyMsTotal },
    { name: "database", ms: counters.databaseLatencyMsTotal },
    { name: "parse", ms: counters.parseLatencyMsTotal },
    { name: "prompt", ms: counters.promptBuildMsTotal },
  ].sort((a, b) => b.ms - a.ms);
  const dominant = stages[0];
  const dominantPct =
    totalElapsedMs > 0
      ? Math.round((dominant.ms / totalElapsedMs) * 1000) / 10
      : 0;

  return {
    batchId,
    totalElapsedMs,
    averageAiLatencyMs: avgModelLatency,
    slowestAiRequestMs: counters.modelLatencyMsMax,
    databaseWriteMs: counters.databaseLatencyMsTotal,
    promptConstructionMs: counters.promptBuildMsTotal,
    inputTokensTotal: counters.inputTokensTotal,
    outputTokensTotal: counters.outputTokensTotal,
    rowsPerMinute,
    processingMode: counters.sequential ? "sequential" : "concurrent",
    concurrency: counters.concurrency,
    chunkSize: counters.chunkSize,
    modelRequestCount: counters.modelRequestCount,
    retryCount: counters.retryCount,
    successfulRows,
    failedRows,
    totalRows,
    dominantBottleneck: dominant.name,
    dominantBottleneckPercent: dominantPct,
  };
}
