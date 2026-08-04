"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPayRange } from "@/lib/pay-range";

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
    lastSeenAt: Date;
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
}

export function RequisitionTable({ data, onPageChange }: RequisitionTableProps) {
  const [selectedRequisition, setSelectedRequisition] = useState<string | null>(null);

  const getRecommendationBadgeClass = (recommendation: string | null | undefined) => {
    switch (recommendation) {
      case "Recruit Immediately":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "High Priority":
        return "bg-green-100 text-green-800 border-green-200";
      case "Good Opportunity":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Candidate Driven":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Only If Candidate Available":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Skip or Monitor":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getConfidenceBadgeClass = (confidence: string) => {
    switch (confidence) {
      case "High":
        return "bg-green-100 text-green-800";
      case "Medium":
        return "bg-yellow-100 text-yellow-800";
      case "Low":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (value === null || value === undefined || value === "") return "Not available";
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return "Not available";
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (value: string | null | undefined) => {
    if (value === null || value === undefined || value === "") return "Not available";
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return "Not available";
    return `${num.toFixed(1)}%`;
  };

  if (!data || data.requisitions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <div className="text-gray-500 mb-2">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          No requisitions have been imported yet
        </h3>
        <p className="text-gray-500 mb-6 max-w-md mx-auto">
          Upload MSP portal screenshots or a spreadsheet to extract, analyze, and rank your
          requisitions.
        </p>
        <Link
          href="/requisitions/import"
          className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700"
        >
          Import Requisitions
        </Link>
        <p className="text-xs text-gray-400 mt-4">
          Supports PNG, JPG, WEBP, XLSX, XLS, and CSV
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recommendation
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Req ID
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Job Title
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Submissions
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bill Rate
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                W-2 Pay Range
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Profit/Hr
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Margin
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Weekly Profit
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fillability
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.requisitions.map((item) => {
              const req = item.requisition;
              const analysis = item.analysis;

              return (
                <tr
                  key={req.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedRequisition(req.id)}
                >
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {analysis?.rank || "-"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        analysis?.opportunityScore && analysis.opportunityScore >= 80
                          ? "bg-green-100 text-green-800"
                          : analysis?.opportunityScore && analysis.opportunityScore >= 60
                          ? "bg-blue-100 text-blue-800"
                          : analysis?.opportunityScore && analysis.opportunityScore >= 40
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {analysis?.opportunityScore || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getRecommendationBadgeClass(
                        analysis?.finalRecommendation
                      )}`}
                    >
                      {analysis?.finalRecommendation || "Unknown"}
                    </span>
                    {analysis?.requiresManualReview && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Review
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {req.requisitionId || "-"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {req.normalizedCustomerName || req.sourceCustomerName || "-"}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {req.jobTitle || "-"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.location || "-"}
                    {req.remoteOrOnsite && req.remoteOrOnsite !== "Unknown" && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({req.remoteOrOnsite})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.sourceDuration || "-"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.submissionCount ?? "-"}
                    {req.activeSubmissionCount ? (
                      <span className="text-xs text-gray-400 ml-1">
                        ({req.activeSubmissionCount} active)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(req.displayedVendorRate)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {analysis
                      ? formatPayRange(
                          analysis.recommendedPayMin,
                          analysis.recommendedPayMax
                        )
                      : "Not available"}
                  </td>
                  <td
                    className={`px-3 py-4 whitespace-nowrap text-sm font-medium ${
                      analysis?.estimatedProfitPerHour &&
                      parseFloat(analysis.estimatedProfitPerHour) < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {formatCurrency(analysis?.estimatedProfitPerHour)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatPercent(analysis?.netMarginPercent)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(analysis?.weeklyProfit)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {analysis?.fillabilityLabel || "-"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getConfidenceBadgeClass(
                        req.sourceConfidence
                      )}`}
                    >
                      {req.sourceConfidence}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{" "}
            {Math.min(
              data.pagination.page * data.pagination.limit,
              data.pagination.total
            )}{" "}
            of {data.pagination.total} results
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(data.pagination.page - 1)}
              disabled={data.pagination.page === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1)
              .filter(
                (page) =>
                  page === 1 ||
                  page === data.pagination.totalPages ||
                  Math.abs(page - data.pagination.page) <= 2
              )
              .map((page, index, arr) => {
                if (index > 0 && arr[index - 1] !== page - 1) {
                  return (
                    <span
                      key={`ellipsis-${page}`}
                      className="px-2 py-1 text-gray-500"
                    >
                      ...
                    </span>
                  );
                }
                return (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`px-3 py-1 border rounded text-sm font-medium ${
                      page === data.pagination.page
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            <button
              onClick={() => onPageChange(data.pagination.page + 1)}
              disabled={data.pagination.page === data.pagination.totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
