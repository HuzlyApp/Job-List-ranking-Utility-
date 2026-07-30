"use client";

import { FileTextIcon, ClockIcon, UserIcon, AlertCircleIcon, CheckIcon } from "@/components/ui/icons";

interface BatchSummaryProps {
  batchId: string;
  mspProgram?: string;
  fileCount: number;
  startedBy?: string;
  startedAt?: string;
  status: string;
  rowsDetected: number;
  rowsValid?: number;
  rowsNeedingReview?: number;
  duplicateIds?: number;
  warnings?: number;
  sourceFilename?: string;
  fileType?: string;
  detectedEncoding?: string;
  isCompleteList?: boolean;
}

export function BatchSummaryPanel({
  batchId,
  mspProgram,
  fileCount,
  startedBy,
  startedAt,
  status,
  rowsDetected,
  rowsValid,
  rowsNeedingReview,
  duplicateIds,
  warnings,
  sourceFilename,
  fileType,
  detectedEncoding,
  isCompleteList,
}: BatchSummaryProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full">
            <CheckIcon className="w-3 h-3" />
            Completed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded-full">
            <AlertCircleIcon className="w-3 h-3" />
            Failed
          </span>
        );
      case "awaiting_review":
      case "reviewing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
            Awaiting Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-100 text-blue-800 rounded-full">
            Processing
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-bold text-slate-900">Import Summary</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase">Status</span>
          {getStatusBadge()}
        </div>

        {/* Batch ID - Copyable */}
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase">Batch ID</span>
          <div className="mt-1 flex items-center gap-2">
            <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
              {batchId.slice(0, 16)}...
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(batchId)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
            >
              Copy
            </button>
          </div>
        </div>

        {/* MSP Program */}
        {mspProgram && (
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase">MSP Program</span>
            <p className="mt-1 text-sm font-bold text-slate-900">{mspProgram}</p>
          </div>
        )}

        {/* File Info */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <FileTextIcon className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">Files</span>
          </div>
          <p className="text-sm font-bold text-slate-900">{fileCount}</p>
          {sourceFilename && (
            <p className="text-xs font-medium text-slate-600 mt-1 truncate" title={sourceFilename}>
              {sourceFilename}
            </p>
          )}
          {fileType && (
            <p className="text-xs font-medium text-slate-500 mt-0.5">{fileType}</p>
          )}
        </div>

        {/* Encoding */}
        {detectedEncoding && (
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase">Encoding</span>
            <p className="mt-1 text-sm font-medium text-slate-700">{detectedEncoding}</p>
          </div>
        )}

        {/* Complete List */}
        {isCompleteList !== undefined && (
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase">Complete List</span>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {isCompleteList ? "Yes" : "No"}
            </p>
          </div>
        )}

        {/* Row Stats */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Rows Detected</span>
            <span className="text-sm font-bold text-slate-900">{rowsDetected.toLocaleString()}</span>
          </div>
          {rowsValid !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Valid Rows</span>
              <span className="text-sm font-bold text-emerald-700">{rowsValid.toLocaleString()}</span>
            </div>
          )}
          {rowsNeedingReview !== undefined && rowsNeedingReview > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Needs Review</span>
              <span className="text-sm font-bold text-amber-700">{rowsNeedingReview.toLocaleString()}</span>
            </div>
          )}
          {duplicateIds !== undefined && duplicateIds > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Duplicate IDs</span>
              <span className="text-sm font-bold text-amber-700">{duplicateIds.toLocaleString()}</span>
            </div>
          )}
          {warnings !== undefined && warnings > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Warnings</span>
              <span className="text-sm font-bold text-amber-700">{warnings.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        {(startedBy || startedAt) && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {startedBy && (
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">{startedBy}</span>
              </div>
            )}
            {startedAt && (
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">
                  {new Date(startedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
