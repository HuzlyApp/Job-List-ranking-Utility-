"use client";

import Link from "next/link";
import { ChevronLeftIcon, XIcon, PlusIcon } from "@/components/ui/icons";

interface ImportHeaderProps {
  batchId?: string;
  showCancel?: boolean;
  showNewImport?: boolean;
  onCancel?: () => void;
}

export function ImportHeader({
  batchId,
  showCancel,
  showNewImport,
  onCancel,
}: ImportHeaderProps) {
  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-3">
        <Link
          href="/requisitions"
          className="text-slate-700 hover:text-slate-900 font-bold"
        >
          Requisitions
        </Link>
        <span className="text-slate-500">/</span>
        <Link
          href="/requisitions/import"
          className="text-slate-700 hover:text-slate-900 font-bold"
        >
          Import
        </Link>
        {batchId && (
          <>
            <span className="text-slate-500">/</span>
            <span className="text-slate-900 font-bold">{batchId.slice(0, 8)}</span>
          </>
        )}
      </nav>

      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import Requisitions</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Upload Randstad portal exports or screenshots, review the extracted data,
            and generate ranked staffing opportunities.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {showCancel && onCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <XIcon className="w-4 h-4" />
              Cancel Import
            </button>
          )}
          {showNewImport && (
            <Link
              href="/requisitions/import"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New Import
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
