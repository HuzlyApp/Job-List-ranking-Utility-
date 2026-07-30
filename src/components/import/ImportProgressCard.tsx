"use client";

import { LoaderIcon, CheckIcon, AlertTriangleIcon, CircleIcon } from "@/components/ui/icons";

export type StageStatus = "pending" | "active" | "complete" | "warning" | "failed";

export interface ProcessingStage {
  id: string;
  label: string;
  description?: string;
  status: StageStatus;
  detail?: string;
}

interface ImportProgressCardProps {
  title: string;
  subtitle: string;
  stages: ProcessingStage[];
  currentFile?: string;
  fileProgress?: {
    current: number;
    total: number;
  };
  rowCount?: number;
  warningCount?: number;
  elapsedTime?: string;
}

export function ImportProgressCard({
  title,
  subtitle,
  stages,
  currentFile,
  fileProgress,
  rowCount,
  warningCount,
  elapsedTime,
}: ImportProgressCardProps) {
  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
          <LoaderIcon className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>
        </div>
      </div>

      {/* File Info */}
      {(currentFile || fileProgress) && (
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-700">Current File</span>
            {elapsedTime && (
              <span className="text-xs font-medium text-slate-500">{elapsedTime}</span>
            )}
          </div>
          {currentFile && (
            <p className="text-sm font-medium text-slate-900 mb-2">{currentFile}</p>
          )}
          <div className="flex items-center gap-4 text-xs">
            {rowCount !== undefined && (
              <span className="font-bold text-slate-700">
                {rowCount.toLocaleString()} rows detected
              </span>
            )}
            {warningCount !== undefined && warningCount > 0 && (
              <span className="font-bold text-amber-700">
                {warningCount} warnings
              </span>
            )}
            {fileProgress && (
              <span className="font-bold text-slate-700">
                {fileProgress.current} of {fileProgress.total} files processed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stage Checklist */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`flex items-start gap-3 p-3 rounded-lg transition-colors
              ${stage.status === "active" ? "bg-emerald-50 border border-emerald-200" : ""}
              ${stage.status === "failed" ? "bg-red-50 border border-red-200" : ""}
              ${stage.status === "warning" ? "bg-amber-50 border border-amber-200" : ""}
            `}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {stage.status === "complete" && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckIcon className="w-3 h-3 text-white" />
                </div>
              )}
              {stage.status === "active" && (
                <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              )}
              {stage.status === "pending" && (
                <CircleIcon className="w-5 h-5 text-slate-300" />
              )}
              {stage.status === "warning" && (
                <AlertTriangleIcon className="w-5 h-5 text-amber-500" />
              )}
              {stage.status === "failed" && (
                <AlertTriangleIcon className="w-5 h-5 text-red-500" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-bold
                  ${stage.status === "failed" ? "text-red-800" : ""}
                  ${stage.status === "warning" ? "text-amber-800" : ""}
                  ${stage.status === "active" ? "text-emerald-800" : ""}
                  ${stage.status === "complete" ? "text-slate-800" : ""}
                  ${stage.status === "pending" ? "text-slate-500" : ""}
                `}
              >
                {stage.label}
              </p>
              {stage.description && (
                <p className="text-xs font-medium text-slate-600 mt-0.5">
                  {stage.description}
                </p>
              )}
              {stage.detail && (
                <p className="text-xs font-bold text-slate-700 mt-1">
                  {stage.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
