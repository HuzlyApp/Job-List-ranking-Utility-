"use client";

import { LoaderIcon, CheckIcon, AlertCircleIcon, BotIcon } from "@/components/ui/icons";

interface AnalysisStage {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "failed";
}

interface ClaudeAnalysisProgressProps {
  totalRequisitions: number;
  analyzedCount: number;
  currentBatch?: number;
  totalBatches?: number;
  stages: AnalysisStage[];
  validationWarnings?: number;
  repairRetries?: number;
}

export function ClaudeAnalysisProgress({
  totalRequisitions,
  analyzedCount,
  currentBatch,
  totalBatches,
  stages,
  validationWarnings,
  repairRetries,
}: ClaudeAnalysisProgressProps) {
  const progress = totalRequisitions > 0 ? (analyzedCount / totalRequisitions) * 100 : 0;

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-violet-100 to-emerald-100 rounded-xl flex items-center justify-center">
          <BotIcon className="w-6 h-6 text-violet-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">
            Analyzing {totalRequisitions} requisitions with Claude
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Claude is estimating pay ranges, fillability, market-rate risk, and role classification.
            Financial calculations will be completed by the application after the AI response is validated.
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-slate-700">
            {analyzedCount} of {totalRequisitions} analyzed
          </span>
          <span className="text-sm font-bold text-emerald-700">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Batch Info */}
      {currentBatch !== undefined && totalBatches !== undefined && (
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-sm font-bold text-slate-700">
            Batch {currentBatch} of {totalBatches}
          </p>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Processing in batches to optimize API usage
          </p>
        </div>
      )}

      {/* Stage Timeline */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors
              ${stage.status === "active" ? "bg-violet-50 border border-violet-200" : ""}
              ${stage.status === "failed" ? "bg-red-50 border border-red-200" : ""}
            `}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0">
              {stage.status === "complete" && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckIcon className="w-3 h-3 text-white" />
                </div>
              )}
              {stage.status === "active" && (
                <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              )}
              {stage.status === "pending" && (
                <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
              )}
              {stage.status === "failed" && (
                <AlertCircleIcon className="w-5 h-5 text-red-500" />
              )}
            </div>

            {/* Label */}
            <p
              className={`text-sm font-bold
                ${stage.status === "failed" ? "text-red-800" : ""}
                ${stage.status === "active" ? "text-violet-800" : ""}
                ${stage.status === "complete" ? "text-slate-800" : ""}
                ${stage.status === "pending" ? "text-slate-500" : ""}
              `}
            >
              {stage.label}
            </p>
          </div>
        ))}
      </div>

      {/* Warnings */}
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

      {/* Safe Leave Notice */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-bold text-blue-800">
          You can safely leave this page. Processing will continue in the background.
        </p>
      </div>
    </div>
  );
}
