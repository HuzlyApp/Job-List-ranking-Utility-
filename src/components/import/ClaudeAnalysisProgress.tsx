"use client";

import { CheckIcon, AlertCircleIcon, BotIcon } from "@/components/ui/icons";

interface AnalysisStage {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "failed";
}

interface GrokAnalysisProgressProps {
  totalRequisitions: number;
  analyzedCount: number;
  successfulCount?: number;
  failedCount?: number;
  progressPercent?: number;
  currentStageLabel?: string;
  currentBatch?: number;
  totalBatches?: number;
  selectedModel?: string | null;
  estimatedCompletionAt?: string | null;
  stages: AnalysisStage[];
  validationWarnings?: number;
  repairRetries?: number;
  lastError?: string | null;
  onRetry?: () => void;
}

function formatEta(estimatedCompletionAt: string | null | undefined): string | null {
  if (!estimatedCompletionAt) return null;
  const target = Date.parse(estimatedCompletionAt);
  if (!Number.isFinite(target)) return null;
  const remainingMs = target - Date.now();
  if (remainingMs <= 0) return null;
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes <= 1) return "about 1 minute";
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function GrokAnalysisProgress({
  totalRequisitions,
  analyzedCount,
  successfulCount,
  failedCount,
  progressPercent,
  currentStageLabel,
  currentBatch,
  totalBatches,
  selectedModel,
  estimatedCompletionAt,
  stages,
  validationWarnings,
  repairRetries,
  lastError,
  onRetry,
}: GrokAnalysisProgressProps) {
  const percent =
    progressPercent != null
      ? Math.max(0, Math.min(100, Math.round(progressPercent)))
      : totalRequisitions > 0
        ? Math.round((analyzedCount / totalRequisitions) * 100)
        : 0;
  const eta = formatEta(estimatedCompletionAt);
  const successful = successfulCount ?? Math.max(0, analyzedCount - (failedCount ?? 0));
  const failed = failedCount ?? 0;

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-sky-100 to-emerald-100 rounded-xl flex items-center justify-center">
          <BotIcon className="w-6 h-6 text-sky-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Analyzing requisitions</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {currentStageLabel ||
              "Grok is estimating competitive W-2 pay ranges, fillability, and market-rate risk."}
          </p>
        </div>
      </div>

      <div
        className="mb-6"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Requisition analysis progress"
      >
        <div className="flex items-end justify-between gap-4 mb-3">
          <p className="text-4xl font-bold tabular-nums text-slate-900 motion-safe:transition-all">
            {percent}%
          </p>
          <p className="text-sm font-bold text-slate-700 text-right">
            {analyzedCount} of {totalRequisitions} requisitions evaluated
          </p>
        </div>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">
          <span className="text-emerald-700 font-bold">{successful} successful</span>
          <span className="mx-2 text-slate-400" aria-hidden>
            ·
          </span>
          <span className={failed > 0 ? "text-amber-800 font-bold" : "text-slate-600"}>
            {failed} failed
          </span>
        </p>
        {eta && (
          <p className="mt-2 text-sm font-medium text-slate-500">
            Estimated time remaining: {eta}
          </p>
        )}
        {selectedModel && (
          <p className="mt-1 text-xs font-medium text-slate-400">
            Model: {selectedModel}
          </p>
        )}
      </div>

      {currentBatch !== undefined && totalBatches !== undefined && totalBatches > 0 && (
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-sm font-bold text-slate-700">
            Chunk {currentBatch} of {totalBatches}
          </p>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Results are saved after each completed chunk
          </p>
        </div>
      )}

      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors
              ${stage.status === "active" ? "bg-sky-50 border border-sky-200" : ""}
              ${stage.status === "failed" ? "bg-red-50 border border-red-200" : ""}
            `}
          >
            <div className="flex-shrink-0">
              {stage.status === "complete" && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckIcon className="w-3 h-3 text-white" />
                </div>
              )}
              {stage.status === "active" && (
                <div
                  className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent motion-safe:animate-spin motion-reduce:border-sky-500"
                  aria-hidden
                />
              )}
              {stage.status === "pending" && (
                <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
              )}
              {stage.status === "failed" && (
                <AlertCircleIcon className="w-5 h-5 text-red-500" />
              )}
            </div>

            <p
              className={`text-sm font-bold
                ${stage.status === "failed" ? "text-red-800" : ""}
                ${stage.status === "active" ? "text-sky-800" : ""}
                ${stage.status === "complete" ? "text-slate-800" : ""}
                ${stage.status === "pending" ? "text-slate-500" : ""}
              `}
            >
              {stage.label}
            </p>
          </div>
        ))}
      </div>

      {lastError && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-bold text-red-800">{lastError}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 text-sm font-bold text-red-900 underline underline-offset-2"
            >
              Retry analysis
            </button>
          )}
        </div>
      )}

      {(validationWarnings !== undefined && validationWarnings > 0) ||
      (repairRetries !== undefined && repairRetries > 0) ? (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-bold text-amber-800">
            {validationWarnings !== undefined && validationWarnings > 0 && (
              <span>{validationWarnings} validation warnings</span>
            )}
            {validationWarnings !== undefined &&
              validationWarnings > 0 &&
              repairRetries !== undefined &&
              repairRetries > 0 && <span className="mx-2">•</span>}
            {repairRetries !== undefined && repairRetries > 0 && (
              <span>{repairRetries} repair retries</span>
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-bold text-blue-800">
          You can leave this page. Progress is saved after each chunk and will resume in this view when you return.
        </p>
      </div>
    </div>
  );
}

/** Backward-compatible export name */
export const ClaudeAnalysisProgress = GrokAnalysisProgress;
