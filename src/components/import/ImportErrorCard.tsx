"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  RotateCcwIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/components/ui/icons";

interface ImportErrorCardProps {
  title: string;
  message: string;
  batchId: string;
  preservedCount?: number;
  correlationId?: string;
  onRetry: () => void;
  onReturnToReview: () => void;
}

export function ImportErrorCard({
  title,
  message,
  batchId,
  preservedCount,
  correlationId,
  onRetry,
  onReturnToReview,
}: ImportErrorCardProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="bg-white border border-red-300 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
          <AlertTriangleIcon className="w-6 h-6 text-red-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-red-800">{title}</h2>
          <p className="mt-1 text-sm font-medium text-red-700">{message}</p>
        </div>
      </div>

      {/* Info Box */}
      {preservedCount !== undefined && preservedCount > 0 && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm font-bold text-emerald-800">
            {preservedCount} imported and reviewed requisitions are safe.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <RotateCcwIcon className="w-4 h-4" />
          Retry Analysis
        </button>
        <button
          onClick={onReturnToReview}
          className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Return to Review
        </button>
      </div>

      {/* Technical Details */}
      {correlationId && (
        <div className="border-t border-slate-200 pt-4">
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-800"
          >
            {showTechnical ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            Technical Details
          </button>
          {showTechnical && (
            <div className="mt-3 p-3 bg-slate-100 rounded-lg">
              <p className="text-xs font-mono text-slate-700">Batch ID: {batchId}</p>
              <p className="text-xs font-mono text-slate-700 mt-1">
                Correlation ID: {correlationId}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
