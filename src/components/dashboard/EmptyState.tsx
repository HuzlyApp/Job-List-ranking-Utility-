"use client";

import Link from "next/link";
import {
  UploadIcon,
  FileTextIcon,
  LayersIcon,
  ImageIcon,
  FileSpreadsheetIcon,
} from "@/components/ui/icons";

interface EmptyStateProps {
  onImportClick?: () => void;
}

export function EmptyState({ onImportClick }: EmptyStateProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 md:p-12">
      <div className="max-w-2xl mx-auto text-center">
        {/* Icon Composition */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 bg-emerald-100 rounded-full blur-2xl opacity-50" />
          <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-lg">
            <UploadIcon className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -right-2 -bottom-2 flex -space-x-2">
            <div className="w-8 h-8 bg-white rounded-lg shadow-md flex items-center justify-center border border-slate-100">
              <ImageIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="w-8 h-8 bg-white rounded-lg shadow-md flex items-center justify-center border border-slate-100">
              <FileSpreadsheetIcon className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-3">
          Import your first requisition list
        </h2>

        {/* Description */}
        <p className="text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
          Upload Randstad or other MSP portal screenshots, CSV files, or spreadsheets. 
          We&apos;ll extract, review, analyze, and rank each requisition.
        </p>

        {/* Primary CTA */}
        {onImportClick ? (
          <button
            onClick={onImportClick}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <UploadIcon className="w-5 h-5" />
            Import Requisitions
          </button>
        ) : (
          <Link
            href="/requisitions/import"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <UploadIcon className="w-5 h-5" />
            Import Requisitions
          </Link>
        )}

        {/* Supported Formats */}
        <p className="mt-4 text-xs text-slate-400">
          Supports PNG, JPG, WEBP, CSV, XLS, and XLSX
        </p>

        {/* 3-Step Guide */}
        <div className="mt-10 pt-8 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StepCard
              step={1}
              icon={<UploadIcon className="w-5 h-5" />}
              title="Upload files"
              description="Screenshots or spreadsheets"
            />
            <StepCard
              step={2}
              icon={<FileTextIcon className="w-5 h-5" />}
              title="Review extracted data"
              description="AI-powered extraction & deduplication"
            />
            <StepCard
              step={3}
              icon={<LayersIcon className="w-5 h-5" />}
              title="View ranked opportunities"
              description="Prioritized by score & profit"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepCard({ 
  step, 
  icon, 
  title, 
  description 
}: { 
  step: number; 
  icon: React.ReactNode; 
  title: string; 
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl mb-3">
        <span className="text-emerald-600">{icon}</span>
      </div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
          {step}
        </span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

// Filtered Empty State - when filters return no results
export function FilteredEmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No requisitions match your filters
      </h3>
      <p className="text-slate-500 mb-4">
        Try adjusting your search or filter criteria
      </p>
      <button
        onClick={onClearFilters}
        className="px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
      >
        Clear Filters
      </button>
    </div>
  );
}

export function ProcessingEmptyState({ batchId }: { batchId?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Your requisitions are still being processed
      </h3>
      <p className="text-slate-500 mb-4">
        Analysis is in progress. Refresh shortly or open the import to check status.
      </p>
      {batchId ? (
        <Link
          href={`/requisitions/import/${batchId}`}
          className="inline-flex px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
        >
          View Import
        </Link>
      ) : null}
    </div>
  );
}

export function AwaitingReviewEmptyState({ batchId }: { batchId?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Your import is ready for review
      </h3>
      <p className="text-slate-500 mb-4">
        Confirm extracted rows to finalize requisitions and populate the dashboard.
      </p>
      <Link
        href={`/requisitions/import/${batchId}`}
        className="inline-flex px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
      >
        Resume Review
      </Link>
    </div>
  );
}

export function FailedImportEmptyState({ batchId }: { batchId?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Your requisitions were imported, but analysis needs to be retried
      </h3>
      <p className="text-slate-500 mb-4">
        Source data may be saved. Open the import batch to retry analysis.
      </p>
      {batchId ? (
        <Link
          href={`/requisitions/import/${batchId}`}
          className="inline-flex px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
        >
          Retry Analysis
        </Link>
      ) : null}
    </div>
  );
}
