"use client";

import { useEffect } from "react";
import {
  XIcon,
  BriefcaseIcon,
  BuildingIcon,
  MapPinIcon,
  ClockIcon,
  DollarSignIcon,
  UsersIcon,
} from "@/components/ui/icons";

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

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "-";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const formatPercent = (value: string | null | undefined) => {
    if (!value) return "-";
    return `${parseFloat(value).toFixed(1)}%`;
  };

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
          {/* Score & Recommendation Banner */}
          {analysis && (
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-blue-50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Opportunity Score</p>
                  <p className="text-3xl font-bold text-emerald-600 tabular-nums">
                    {analysis.opportunityScore || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Rank</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    #{analysis.rank || "-"}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-white border border-emerald-200 text-emerald-700 rounded-full shadow-sm">
                  {analysis.finalRecommendation || "No Recommendation"}
                </span>
                {analysis.requiresManualReview && (
                  <span className="ml-2 inline-flex items-center px-3 py-1.5 text-sm font-medium bg-red-100 text-red-700 rounded-full">
                    Requires Manual Review
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Job Details */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Job Details
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
                <div className="flex items-start gap-2">
                  <UsersIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Submissions</p>
                    <p className="text-sm font-medium text-slate-900">
                      {requisition.requisition.submissionCount ?? "-"}
                      {requisition.requisition.activeSubmissionCount ? (
                        <span className="text-xs text-slate-500 ml-1">
                          ({requisition.requisition.activeSubmissionCount} active)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          {analysis && (
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                Financial Breakdown
              </h3>
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
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Pay Range</p>
                  <p className="text-sm font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(analysis.recommendedPayMin)} - {formatCurrency(analysis.recommendedPayMax)}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${parseFloat(analysis.estimatedProfitPerHour || "0") < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                  <p className="text-xs text-slate-500">Est. Profit/Hr</p>
                  <p className={`text-lg font-semibold tabular-nums ${parseFloat(analysis.estimatedProfitPerHour || "0") < 0 ? "text-red-600" : "text-emerald-600"}`}>
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

          {/* Fillability */}
          {analysis && (
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                Fillability Assessment
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-500">Score</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {analysis.fillabilityScore || "-"}/100
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${analysis.fillabilityScore || 0}%` }}
                    />
                  </div>
                </div>
                <span className="px-3 py-1 text-sm font-medium bg-slate-100 text-slate-700 rounded-full">
                  {analysis.fillabilityLabel || "-"}
                </span>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="px-6 py-5">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
              Metadata
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-900">{requisition.requisition.status || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Confidence</span>
                <span className="font-medium text-slate-900">{requisition.requisition.sourceConfidence}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">First Seen</span>
                <span className="font-medium text-slate-900">
                  {new Date(requisition.requisition.firstSeenAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Updated</span>
                <span className="font-medium text-slate-900">
                  {new Date(requisition.requisition.lastSeenAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
