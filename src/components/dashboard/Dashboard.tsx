"use client";

import { useState, useEffect } from "react";
import { RequisitionTable } from "./RequisitionTable";
import { KPICards } from "./KPICards";
import { Filters } from "./Filters";

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
    firstSeenAt: Date;
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

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    tenantId: "", // Would come from auth context
    mspProgramId: "",
    status: "",
    recommendation: "",
    minOpportunityScore: "",
    maxOpportunityScore: "",
    customer: "",
    isNewToday: false,
    page: 1,
    limit: 20,
  });

  useEffect(() => {
    fetchRequisitions();
  }, [filters]);

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== "" && value !== false) {
          params.append(key, String(value));
        }
      });

      const response = await fetch(`/api/requisitions?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch requisitions");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "xlsx" | "csv") => {
    const params = new URLSearchParams();
    params.append("tenantId", filters.tenantId);
    if (filters.mspProgramId) params.append("mspProgramId", filters.mspProgramId);
    params.append("format", format);

    const response = await fetch(`/api/export?${params}`);
    if (!response.ok) {
      alert("Export failed");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `requisitions-${new Date().toISOString().split("T")[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">Error: {error}</div>
        <button
          onClick={fetchRequisitions}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Zip Staff MSP Requisition Intelligence
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Ranked requisitions with financial projections and opportunity scores
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleExport("csv")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Export CSV
              </button>
              <button
                onClick={() => handleExport("xlsx")}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Export Excel
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPI Cards */}
        <KPICards requisitions={data?.requisitions || []} />

        {/* Filters */}
        <Filters filters={filters} onChange={setFilters} />

        {/* Requisition Table */}
        <div className="mt-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading requisitions...</p>
            </div>
          ) : (
            <RequisitionTable
              data={data}
              onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
            />
          )}
        </div>
      </main>
    </div>
  );
}
