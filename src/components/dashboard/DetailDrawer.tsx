"use client";

import { useEffect } from "react";
import {
  XIcon,
  BriefcaseIcon,
  BuildingIcon,
  MapPinIcon,
  ClockIcon,
} from "@/components/ui/icons";
import {
  formatPayRange,
  formatPayRate,
  formatMoneyMetric,
  formatPercentMetric,
  payRangeFitBadgeClass,
  type PayRangeFit,
} from "@/lib/pay-range";

interface RequisitionDetail {
  requisition: {
    id: string;
    requisitionId: string | null;
    status: string | null;
    sourceCustomerName: string | null;
    normalizedCustomerName: string | null;
    jobTitle: string | null;
    location: string | null;
    remoteOrOnsite: string | null;
    sourceDuration: string | null;
    numberOfPositions: number | null;
    submissionCount: number | null;
    activeSubmissionCount: number | null;
    displayedVendorRate: string | null;
    sourceConfidence: string;
    isNewToday: boolean;
    isNoLongerVisible: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  analysis: {
    rank: number | null;
    opportunityScore: number | null;
    finalRecommendation: string | null;
    estimatedProfitPerHour: string | null;
    netMarginPercent: string | null;
    weeklyProfit: string | null;
    assignmentProfit: string | null;
    effectiveVendorRate: string | null;
    recommendedPayMin: string | null;
    recommendedPayMax: string | null;
    selectedPayRate: string | null;
    fillabilityScore: number | null;
    fillabilityLabel: string | null;
    payRangeFit?: string | null;
    payEstimateReason?: string | null;
    marketRateWarning?: string | null;
    requiresManualReview: boolean;
  } | null;
}

interface DetailDrawerProps {
  requisition: RequisitionDetail | null;
  onClose: () => void;
  isOpen: boolean;
}

export function DetailDrawer({ requisition, onClose, isOpen }: DetailDrawerProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !requisition) return null;

  const analysis = requisition.analysis;

  const formatCurrency = (value: string | null | undefined) =>
    formatMoneyMetric(value);

  const formatPercent = (value: string | null | undefined) =>
    formatPercentMetric(value);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl transform transition-transform animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <BriefcaseIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Requisition Details</h2>
              <p className="text-sm text-slate-500">{requisition.requisition.requisitionId || "No ID"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close drawer"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-80px)]">
          {/* Recruiting Summary */}
          {analysis && (
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-50 to-blue-50 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                Recruiting Summary
              </h3>
              <div className="space-y-3">
                <SummaryRow label="Recommendation" value={analysis.finalRecommendation || "No Recommendation"} />
                <SummaryRow
                  label="Recommended Pay Range"
                  value={formatPayRange(analysis.recommendedPayMin, analysis.recommendedPayMax)}
                  emphasize
                />
                <SummaryRow label="Target Pay Rate" value={formatPayRate(analysis.selectedPayRate)} />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-600">Pay Range Fit</span>
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${payRangeFitBadgeClass(analysis.payRangeFit as PayRangeFit | null | undefined)}`}>
                    {analysis.payRangeFit || "Unavailable"}
                  </span>
                </div>
                <SummaryRow
                  label="Fillability"
                  value={`${analysis.fillabilityLabel || "—"}${analysis.fillabilityScore != null ? ` (${analysis.fillabilityScore}/100)` : ""}`}
                />
                <SummaryRow
                  label="Submissions"
                  value={`${requisition.requisition.submissionCount ?? "—"}${requisition.requisition.activeSubmissionCount ? ` (${requisition.requisition.activeSubmissionCount} active)` : ""}`}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold bg-white border border-emerald-200 text-emerald-700 rounded-full">
                    Score {analysis.opportunityScore ?? "—"} · Rank #{analysis.rank ?? "—"}
                  </span>
                  {analysis.requiresManualReview && (
                    <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full">
                      Requires Manual Review
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Job Information */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Job Information
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500">Job Title</p>
                <p className="text-base font-medium text-slate-900">
                  {requisition.requisition.jobTitle || "-"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <BuildingIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Customer</p>
                    <p className="text-sm font-medium text-slate-900">
                      {requisition.requisition.normalizedCustomerName || requisition.requisition.sourceCustomerName || "-"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Location</p>
                    <p className="text-sm font-medium text-slate-900">
                      {requisition.requisition.location || "-"}
                      {requisition.requisition.remoteOrOnsite && requisition.requisition.remoteOrOnsite !== "Unknown" && (
                        <span className="block text-xs text-slate-500">
                          {requisition.requisition.remoteOrOnsite}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <ClockIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Duration</p>
                    <p className="text-sm font-medium text-slate-900">
                      {requisition.requisition.sourceDuration || "-"}
                    </p>
                  </div>
                </div>
                <SummaryRow label="Status" value={requisition.requisition.status || "—"} />
              </div>
            </div>
          </div>

          {/* Duplicate / History */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Duplicate / History
            </h3>
            <div className="space-y-3">
              {requisition.requisition.isNewToday && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full">
                  New Today
                </span>
              )}
              <SummaryRow
                label="First Seen"
                value={new Date(requisition.requisition.firstSeenAt).toLocaleDateString()}
              />
              <SummaryRow
                label="Last Seen"
                value={new Date(requisition.requisition.lastSeenAt).toLocaleDateString()}
              />
              <SummaryRow label="Source Confidence" value={requisition.requisition.sourceConfidence} />
            </div>
          </div>

          {/* Secondary Financial Details */}
          {analysis && (
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                Secondary Financial Details
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Margin and profit context shown after recruiting pay guidance.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Bill Rate</p>
                  <p className="text-lg font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(requisition.requisition.displayedVendorRate)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Effective Rate</p>
                  <p className="text-lg font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(analysis.effectiveVendorRate)}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${
                  analysis.estimatedProfitPerHour != null &&
                  Number.isFinite(parseFloat(analysis.estimatedProfitPerHour)) &&
                  parseFloat(analysis.estimatedProfitPerHour) < 0
                    ? "bg-red-50"
                    : "bg-emerald-50"
                }`}>
                  <p className="text-xs text-slate-500">Est. Profit/Hr</p>
                  <p className={`text-lg font-semibold tabular-nums ${
                    analysis.estimatedProfitPerHour != null &&
                    Number.isFinite(parseFloat(analysis.estimatedProfitPerHour)) &&
                    parseFloat(analysis.estimatedProfitPerHour) < 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  }`}>
                    {formatCurrency(analysis.estimatedProfitPerHour)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Net Margin</p>
                  <p className="text-base font-semibold text-slate-900 tabular-nums">
                    {formatPercent(analysis.netMarginPercent)}
                  </p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Weekly Profit</p>
                  <p className="text-base font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(analysis.weeklyProfit)}
                  </p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Assignment</p>
                  <p className="text-base font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(analysis.assignmentProfit)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grok Analysis */}
          {analysis && (
            <div className="px-6 py-5">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                AI Analysis
              </h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">Pay estimate rationale</p>
                  <p className="mt-1 text-slate-600">
                    {analysis.payEstimateReason || "No pay estimate rationale was provided."}
                  </p>
                </div>
                {analysis.marketRateWarning && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="font-semibold text-amber-900">Market rate warning</p>
                    <p className="mt-1 text-amber-800">{analysis.marketRateWarning}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function SummaryRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={`text-right text-sm font-semibold tabular-nums ${
          emphasize ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
