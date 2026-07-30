"use client";

import { CheckIcon, ArrowRightIcon, RotateCcwIcon, AlertTriangleIcon } from "@/components/ui/icons";

interface ImportCompletionSummaryProps {
  newRecordsCreated: number;
  existingRecordsUpdated: number;
  duplicatesConsolidated: number;
  payRangesGenerated: number;
  recordsNeedingReview: number;
  onViewResults: () => void;
  onReviewIssues?: () => void;
  onNewImport: () => void;
}

export function ImportCompletionSummary({
  newRecordsCreated,
  existingRecordsUpdated,
  duplicatesConsolidated,
  payRangesGenerated,
  recordsNeedingReview,
  onViewResults,
  onReviewIssues,
  onNewImport,
}: ImportCompletionSummaryProps) {
  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
          <CheckIcon className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Import Complete</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Your requisitions have been processed and analyzed.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          value={newRecordsCreated}
          label="New Requisitions"
          accent="success"
        />
        <StatCard
          value={existingRecordsUpdated}
          label="Existing Records Updated"
          accent={existingRecordsUpdated > 0 ? "success" : "neutral"}
        />
        <StatCard
          value={duplicatesConsolidated}
          label="Duplicates Consolidated"
          accent={duplicatesConsolidated > 0 ? "warning" : "neutral"}
        />
        <StatCard
          value={payRangesGenerated}
          label="Pay Ranges Generated"
          accent="success"
        />
        <StatCard
          value={recordsNeedingReview}
          label="Records Needing Review"
          accent={recordsNeedingReview > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Issues Warning */}
      {recordsNeedingReview > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                {recordsNeedingReview} records require follow-up
              </p>
              <p className="text-xs font-medium text-amber-700 mt-1">
                These records were saved but may need manual review or correction.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onViewResults}
          className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          View Ranked Results
          <ArrowRightIcon className="w-4 h-4" />
        </button>
        {recordsNeedingReview > 0 && onReviewIssues && (
          <button
            onClick={onReviewIssues}
            className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Review Remaining Issues
          </button>
        )}
        <button
          onClick={onNewImport}
          className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RotateCcwIcon className="w-4 h-4" />
          Start New Import
        </button>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "neutral" | "success" | "warning";
}) {
  const accentStyles = {
    neutral: "bg-slate-100 border-slate-200",
    success: "bg-emerald-50 border-emerald-200",
    warning: "bg-amber-50 border-amber-200",
  };

  const valueStyles = {
    neutral: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
  };

  return (
    <div className={`p-4 border rounded-lg ${accentStyles[accent]}`}>
      <p className={`text-2xl font-bold ${valueStyles[accent]}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs font-bold text-slate-600 mt-1">{label}</p>
    </div>
  );
}
