"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  ExternalLinkIcon,
} from "@/components/ui/icons";

interface RequisitionWithAnalysis {
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

interface DashboardData {
  requisitions: RequisitionWithAnalysis[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface RequisitionTableProps {
  data: DashboardData | null;
  onPageChange: (page: number) => void;
  onRowClick?: (id: string) => void;
  isLoading?: boolean;
}

type SortField = "rank" | "opportunityScore" | "customer" | "profit" | "margin" | "billRate";
type SortDirection = "asc" | "desc";

export function RequisitionTable({ data, onPageChange, onRowClick, isLoading }: RequisitionTableProps) {
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const toggleRowSelection = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedRows.size === (data?.requisitions.length || 0)) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data?.requisitions.map((r) => r.requisition.id) || []));
    }
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "-";
    const num = parseFloat(value);
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (value: string | null | undefined) => {
    if (!value) return "-";
    const num = parseFloat(value);
    return `${num.toFixed(1)}%`;
  };

  const getRecommendationBadge = (recommendation: string | null | undefined) => {
    const styles: Record<string, string> = {
      "Recruit Immediately": "bg-emerald-100 text-emerald-700 border-emerald-200",
      "High Priority": "bg-green-100 text-green-700 border-green-200",
      "Good Opportunity": "bg-blue-100 text-blue-700 border-blue-200",
      "Candidate Driven": "bg-amber-100 text-amber-700 border-amber-200",
      "Only If Candidate Available": "bg-orange-100 text-orange-700 border-orange-200",
      "Skip or Monitor": "bg-slate-100 text-slate-700 border-slate-200",
    };
    return styles[recommendation || ""] || "bg-slate-100 text-slate-700 border-slate-200";
  };

  const getScoreBadge = (score: number | null | undefined) => {
    if (!score) return "bg-slate-100 text-slate-700";
    if (score >= 80) return "bg-emerald-100 text-emerald-700";
    if (score >= 60) return "bg-blue-100 text-blue-700";
    if (score >= 40) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-slate-100 border-b border-slate-200" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 border-b border-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.requisitions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-300">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedRows.size === data.requisitions.length && data.requisitions.length > 0}
                  onChange={toggleAllSelection}
                  className="w-4 h-4 text-emerald-600 border-slate-400 rounded focus:ring-emerald-500"
                />
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-200"
                onClick={() => handleSort("rank")}
              >
                <div className="flex items-center gap-1">
                  Rank
                  <ArrowUpDownIcon className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-200"
                onClick={() => handleSort("opportunityScore")}
              >
                <div className="flex items-center gap-1">
                  Score
                  <ArrowUpDownIcon className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recommendation
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Req ID
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-200"
                onClick={() => handleSort("customer")}
              >
                <div className="flex items-center gap-1">
                  Customer
                  <ArrowUpDownIcon className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Job Title
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Location
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sub
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bill Rate
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-200"
                onClick={() => handleSort("profit")}
              >
                <div className="flex items-center gap-1">
                  Profit/Hr
                  <ArrowUpDownIcon className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-200"
                onClick={() => handleSort("margin")}
              >
                <div className="flex items-center gap-1">
                  Margin
                  <ArrowUpDownIcon className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Fillability
              </th>
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {data.requisitions.map((item) => {
              const req = item.requisition;
              const analysis = item.analysis;
              const isSelected = selectedRows.has(req.id);

              return (
                <tr
                  key={req.id}
                  className={`group hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? "bg-emerald-50/50" : ""}`}
                  onClick={() => onRowClick?.(req.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(req.id)}
                      className="w-4 h-4 text-emerald-600 border-slate-400 rounded focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-bold text-slate-900 tabular-nums">
                      {analysis?.rank || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${getScoreBadge(analysis?.opportunityScore)}`}>
                        {analysis?.opportunityScore || "-"}
                      </span>
                      {req.isNewToday && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded">
                          New
                        </span>
                      )}
                      {req.isNoLongerVisible && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-slate-200 text-slate-700 rounded">
                          Hidden
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${getRecommendationBadge(analysis?.finalRecommendation)}`}>
                      {analysis?.finalRecommendation || "Unknown"}
                    </span>
                    {analysis?.requiresManualReview && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">
                        Review
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-sm font-medium text-slate-800">
                      {req.requisitionId || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-800">
                      {req.normalizedCustomerName || req.sourceCustomerName || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm font-medium text-slate-800 line-clamp-1 max-w-[200px]" title={req.jobTitle || ""}>
                      {req.jobTitle || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">
                      {req.location || "-"}
                    </span>
                    {req.remoteOrOnsite && req.remoteOrOnsite !== "Unknown" && (
                      <span className="block text-xs font-medium text-slate-600">
                        {req.remoteOrOnsite}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      {req.submissionCount ?? "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      {formatCurrency(req.displayedVendorRate)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <span className={`text-sm font-bold tabular-nums ${
                      analysis?.estimatedProfitPerHour && parseFloat(analysis.estimatedProfitPerHour) < 0
                        ? "text-red-700"
                        : "text-emerald-700"
                    }`}>
                      {formatCurrency(analysis?.estimatedProfitPerHour)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      {formatPercent(analysis?.netMarginPercent)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">
                      {analysis?.fillabilityLabel || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <button 
                      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontalIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-300 bg-slate-100">
          <div className="text-sm font-medium text-slate-700">
            Showing{" "}
            <span className="font-bold text-slate-900">{(data.pagination.page - 1) * data.pagination.limit + 1}</span>
            {" "}to{" "}
            <span className="font-bold text-slate-900">
              {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}
            </span>
            {" "}of{" "}
            <span className="font-bold text-slate-900">{data.pagination.total}</span>
            {" "}results
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(data.pagination.page - 1)}
              disabled={data.pagination.page === 1}
              className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            
            {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
              let pageNum: number;
              if (data.pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (data.pagination.page <= 3) {
                pageNum = i + 1;
              } else if (data.pagination.page >= data.pagination.totalPages - 2) {
                pageNum = data.pagination.totalPages - 4 + i;
              } else {
                pageNum = data.pagination.page - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`min-w-[2rem] h-8 px-2 text-sm font-bold rounded-lg transition-colors
                    ${pageNum === data.pagination.page
                      ? "bg-emerald-600 text-white"
                      : "text-slate-800 hover:bg-slate-300"
                    }
                  `}
                >
                  {pageNum}
                </button>
              );
            })}
            
            <button
              onClick={() => onPageChange(data.pagination.page + 1)}
              disabled={data.pagination.page === data.pagination.totalPages}
              className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              aria-label="Next page"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
