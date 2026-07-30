"use client";

import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";

interface ReviewSummaryBarProps {
  total: number;
  valid: number;
  needsReview: number;
  excluded: number;
  unresolvedDuplicates?: number;
  onSaveDraft?: () => void;
  onBack?: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  confirmLabel?: string;
  isConfirming?: boolean;
  blockingError?: string;
}

export function ReviewSummaryBar({
  total,
  valid,
  needsReview,
  excluded,
  unresolvedDuplicates,
  onSaveDraft,
  onBack,
  onConfirm,
  canConfirm,
  confirmLabel = "Confirm and Analyze",
  isConfirming,
  blockingError,
}: ReviewSummaryBarProps) {
  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{total}</span>
            <span className="text-sm font-bold text-slate-600">total</span>
          </div>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-600" />
            <span className="text-lg font-bold text-emerald-700">{valid}</span>
            <span className="text-sm font-bold text-slate-600">valid</span>
          </div>
          {needsReview > 0 && (
            <>
              <div className="h-6 w-px bg-slate-300" />
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
                <span className="text-lg font-bold text-amber-700">{needsReview}</span>
                <span className="text-sm font-bold text-slate-600">need review</span>
              </div>
            </>
          )}
          {excluded > 0 && (
            <>
              <div className="h-6 w-px bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-500">{excluded}</span>
                <span className="text-sm font-bold text-slate-600">excluded</span>
              </div>
            </>
          )}
          {unresolvedDuplicates !== undefined && unresolvedDuplicates > 0 && (
            <>
              <div className="h-6 w-px bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-amber-700">{unresolvedDuplicates}</span>
                <span className="text-sm font-bold text-slate-600">unresolved duplicates</span>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onSaveDraft && (
            <button
              onClick={onSaveDraft}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Save Draft
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
          )}
          <div className="relative">
            <button
              onClick={onConfirm}
              disabled={!canConfirm || isConfirming}
              className={`px-6 py-2 text-sm font-bold rounded-lg transition-colors
                ${canConfirm && !isConfirming
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
                }
              `}
            >
              {isConfirming ? "Analyzing…" : confirmLabel}
            </button>
            {blockingError && (
              <p className="absolute top-full right-0 mt-1 text-xs font-bold text-red-700 whitespace-nowrap">
                {blockingError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
