"use client";

import Link from "next/link";
import {
  ClockIcon,
  FileTextIcon,
  ImageIcon,
  ChevronRightIcon,
  LoaderIcon,
  CheckIcon,
  AlertTriangleIcon,
} from "@/components/ui/icons";

interface ImportBatch {
  id: string;
  name: string;
  createdAt: string;
  status: "processing" | "awaiting_review" | "completed" | "failed" | "partial";
  fileCount: number;
  totalRows: number;
  rowsRequiringReview: number;
  errorMessage?: string;
}

interface ImportActivityListProps {
  batches: ImportBatch[];
  isLoading?: boolean;
}

const statusConfig = {
  processing: {
    label: "Processing",
    icon: <LoaderIcon className="w-4 h-4" />,
    className: "text-blue-600 bg-blue-50 border-blue-200",
  },
  awaiting_review: {
    label: "Awaiting Review",
    icon: <ClockIcon className="w-4 h-4" />,
    className: "text-amber-600 bg-amber-50 border-amber-200",
  },
  completed: {
    label: "Completed",
    icon: <CheckIcon className="w-4 h-4" />,
    className: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  failed: {
    label: "Failed",
    icon: <AlertTriangleIcon className="w-4 h-4" />,
    className: "text-red-600 bg-red-50 border-red-200",
  },
  partial: {
    label: "Partially Completed",
    icon: <AlertTriangleIcon className="w-4 h-4" />,
    className: "text-amber-600 bg-amber-50 border-amber-200",
  },
};

export function ImportActivityList({ batches, isLoading }: ImportActivityListProps) {
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-32 bg-slate-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-3 w-32 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (batches.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Recent Imports</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {batches.map((batch) => {
          const status = statusConfig[batch.status];
          return (
            <div
              key={batch.id}
              className="px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* File Icon */}
                <div className="flex-shrink-0 w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <FileTextIcon className="w-5 h-5 text-slate-500" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium text-slate-900 truncate">
                        {batch.name}
                      </h4>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {new Date(batch.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" "}&bull;{" "}
                        {batch.fileCount} file{batch.fileCount !== 1 ? "s" : ""}
                        {" "}&bull;{" "}
                        {batch.totalRows} row{batch.totalRows !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${status.className}`}>
                      {status.icon}
                      {status.label}
                    </span>
                  </div>

                  {/* Additional Info */}
                  {batch.rowsRequiringReview > 0 && (
                    <p className="mt-2 text-sm text-amber-600">
                      {batch.rowsRequiringReview} row{batch.rowsRequiringReview !== 1 ? "s" : ""} require review
                    </p>
                  )}
                  {batch.errorMessage && (
                    <p className="mt-2 text-sm text-red-600">
                      {batch.errorMessage}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-3">
                    {batch.status === "awaiting_review" && (
                      <Link
                        href={`/requisitions/import/${batch.id}`}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Review Now
                      </Link>
                    )}
                    {batch.status === "failed" && (
                      <Link
                        href={`/requisitions/import/${batch.id}`}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Retry
                      </Link>
                    )}
                    <Link
                      href={`/requisitions/import/${batch.id}`}
                      className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      View Details
                      <ChevronRightIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {batches.length > 5 && (
        <div className="px-5 py-3 border-t border-slate-100">
          <Link
            href="/history"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center justify-center gap-1"
          >
            View All Imports
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
