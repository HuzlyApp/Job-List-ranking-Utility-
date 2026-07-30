"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";
import { StatCard } from "./StatCard";
import { FilterToolbar, FilterState } from "./FilterToolbar";
import {
  EmptyState,
  FilteredEmptyState,
  ProcessingEmptyState,
  AwaitingReviewEmptyState,
  FailedImportEmptyState,
} from "./EmptyState";
import { ImportActivityList } from "./ImportActivityList";
import { QuickInsights } from "./QuickInsights";
import { RequisitionTable } from "./RequisitionTableNew";
import { DetailDrawer } from "./DetailDrawer";
import { ExportMenu } from "./ExportMenu";
import { ClearDataButton } from "./ClearDataButton";
import {
  BriefcaseIcon,
  SparklesIcon,
  TargetIcon,
  AlertTriangleIcon,
  EyeOffIcon,
  GaugeIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { useAppContext } from "@/lib/app-context";

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

interface DashboardData {
  requisitions: RequisitionWithAnalysis[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  kpis?: {
    totalRequisitions: number;
    newToday: number;
    highPriority: number;
    negativeProfit: number;
    noLongerVisible: number;
    averageOpportunityScore: number | null;
  } | null;
}

const EMPTY_FILTERS: FilterState = {
  search: "",
  status: "",
  recommendation: "",
  minScore: "",
  maxScore: "",
  customer: "",
  isNewToday: false,
  isNoLongerVisible: false,
  negativeProfit: false,
  highPriority: false,
};

type KpiTile =
  | "total"
  | "newToday"
  | "highPriority"
  | "negativeProfit"
  | "noLongerVisible"
  | "avgScore";


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

function mapBatchStatus(
  status: string | null | undefined
): ImportBatch["status"] {
  switch (status) {
    case "awaiting_review":
      return "awaiting_review";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "partially_completed":
      return "partial";
    default:
      return "processing";
  }
}

export function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId } = useAppContext();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequisition, setSelectedRequisition] = useState<RequisitionWithAnalysis | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"rank" | "opportunityScore">("rank");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Fetch functions defined with useCallback
  const fetchRequisitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("tenantId", tenantId);
      params.append("page", String(page));
      params.append("limit", "20");
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);

      if (filters.status) params.append("status", filters.status);
      if (filters.recommendation) params.append("recommendation", filters.recommendation);
      if (filters.minScore) params.append("minOpportunityScore", filters.minScore);
      if (filters.maxScore) params.append("maxOpportunityScore", filters.maxScore);
      if (filters.customer) params.append("customer", filters.customer);
      if (filters.search) params.append("customer", filters.search);
      if (filters.isNewToday) params.append("isNewToday", "true");
      if (filters.isNoLongerVisible) params.append("isNoLongerVisible", "true");
      if (filters.negativeProfit) params.append("negativeProfit", "true");
      if (filters.highPriority) params.append("highPriority", "true");

      const response = await fetch(`/api/requisitions?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to fetch requisitions");

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filters, sortBy, sortOrder]);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const response = await fetch(
        `/api/batches?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        setBatches([]);
        return;
      }
      const result = await response.json();
      const mapped: ImportBatch[] = (result.batches || []).slice(0, 5).map(
        (batch: {
          id: string;
          status?: string;
          createdAt?: string;
          filesCount?: number;
          sanitizedErrorMessage?: string | null;
          processingSummary?: {
            sourceRowCount?: number;
            uniqueRequisitionCount?: number;
            originalFilename?: string;
          } | null;
        }) => ({
          id: batch.id,
          name:
            batch.processingSummary?.originalFilename ||
            `Import ${batch.id.slice(0, 8)}`,
          createdAt: batch.createdAt || new Date().toISOString(),
          status: mapBatchStatus(batch.status),
          fileCount: batch.filesCount ?? 0,
          totalRows:
            batch.processingSummary?.sourceRowCount ??
            batch.processingSummary?.uniqueRequisitionCount ??
            0,
          rowsRequiringReview: 0,
          errorMessage: batch.sanitizedErrorMessage || undefined,
        })
      );
      setBatches(mapped);
    } catch {
      setBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  }, [tenantId]);

  // Effects
  useEffect(() => {
    fetch("/api/setup").catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // After import completion, force a fresh fetch
  useEffect(() => {
    if (searchParams.get("imported") === "1") {
      fetchRequisitions();
      fetchBatches();
      router.replace("/");
    }
  }, [searchParams, fetchRequisitions, fetchBatches, router]);

  const handleExport = async (format: "csv" | "xlsx") => {
    const params = new URLSearchParams();
    params.append("tenantId", tenantId);
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

  const kpis = useMemo(() => {
    return {
      totalRequisitions:
        data?.kpis?.totalRequisitions ?? data?.pagination?.total ?? 0,
      newToday: data?.kpis?.newToday ?? 0,
      highPriority: data?.kpis?.highPriority ?? 0,
      negativeProfit: data?.kpis?.negativeProfit ?? 0,
      noLongerVisible: data?.kpis?.noLongerVisible ?? 0,
      avgScore: data?.kpis?.averageOpportunityScore ?? 0,
    };
  }, [data]);

  const activeKpi: KpiTile | null = useMemo(() => {
    if (filters.isNewToday) return "newToday";
    if (filters.highPriority) return "highPriority";
    if (filters.negativeProfit) return "negativeProfit";
    if (filters.isNoLongerVisible) return "noLongerVisible";
    if (sortBy === "opportunityScore") return "avgScore";
    if (
      !filters.search &&
      !filters.status &&
      !filters.recommendation &&
      !filters.minScore &&
      !filters.maxScore &&
      !filters.customer
    ) {
      return "total";
    }
    return null;
  }, [filters, sortBy]);

  const applyKpiFilter = (tile: KpiTile) => {
    setPage(1);

    if (activeKpi === tile && tile !== "total") {
      setFilters(EMPTY_FILTERS);
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "total") {
      setFilters(EMPTY_FILTERS);
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "newToday") {
      setFilters({ ...EMPTY_FILTERS, isNewToday: true });
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "highPriority") {
      setFilters({ ...EMPTY_FILTERS, highPriority: true });
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "negativeProfit") {
      setFilters({ ...EMPTY_FILTERS, negativeProfit: true });
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "noLongerVisible") {
      setFilters({ ...EMPTY_FILTERS, isNoLongerVisible: true });
      setSortBy("rank");
      setSortOrder("asc");
    } else if (tile === "avgScore") {
      setFilters(EMPTY_FILTERS);
      setSortBy("opportunityScore");
      setSortOrder("desc");
    }

    requestAnimationFrame(() => {
      document
        .getElementById("requisition-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const quickInsights = useMemo(() => {
    if (!data?.requisitions?.length) return null;

    const reqs = data.requisitions;
    
    const topOpportunity = reqs
      .filter((r) => r.analysis?.opportunityScore)
      .sort((a, b) => (b.analysis?.opportunityScore || 0) - (a.analysis?.opportunityScore || 0))[0];

    const totalWeeklyProfit = reqs.reduce((sum, r) => {
      return sum + parseFloat(r.analysis?.weeklyProfit || "0");
    }, 0);
    const negativeProfitCount = reqs.filter((r) => {
      return parseFloat(r.analysis?.estimatedProfitPerHour || "0") <= 0;
    }).length;
    const avgMargin = reqs.length > 0
      ? reqs.reduce((sum, r) => sum + parseFloat(r.analysis?.netMarginPercent || "0"), 0) / reqs.length
      : 0;

    const lowCompetition = reqs.filter((r) => (r.requisition.submissionCount || 0) <= 2).length;
    const highCompetition = reqs.filter((r) => (r.requisition.submissionCount || 0) > 10).length;
    const avgSubmissions = reqs.length > 0
      ? reqs.reduce((sum, r) => sum + (r.requisition.submissionCount || 0), 0) / reqs.length
      : 0;

    return {
      topOpportunity: topOpportunity?.analysis
        ? {
            jobTitle: topOpportunity.requisition.jobTitle || "Unknown",
            requisitionId: topOpportunity.requisition.requisitionId || "-",
            opportunityScore: topOpportunity.analysis.opportunityScore || 0,
            recommendation: topOpportunity.analysis.finalRecommendation || "Unknown",
            estimatedProfitPerHour: parseFloat(topOpportunity.analysis.estimatedProfitPerHour || "0"),
          }
        : null,
      portfolioStats: {
        estimatedWeeklyProfit: totalWeeklyProfit,
        negativeProfitCount,
        averageNetMargin: avgMargin,
      },
      competitionStats: {
        lowCompetitionCount: lowCompetition,
        highCompetitionCount: highCompetition,
        averageSubmissions: avgSubmissions,
      },
    };
  }, [data]);

  const customers = useMemo(() => {
    if (!data?.requisitions) return [];
    const customerSet = new Set<string>();
    data.requisitions.forEach((r) => {
      const name = r.requisition.normalizedCustomerName || r.requisition.sourceCustomerName;
      if (name) customerSet.add(name);
    });
    return Array.from(customerSet).sort();
  }, [data]);

  const hasActiveFilters =
    filters.search ||
    filters.status ||
    filters.recommendation ||
    filters.minScore ||
    filters.maxScore ||
    filters.customer ||
    filters.isNewToday ||
    filters.isNoLongerVisible ||
    filters.negativeProfit ||
    filters.highPriority ||
    sortBy !== "rank";

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSortBy("rank");
    setSortOrder("asc");
  };

  const hasRequisitions =
    (data?.kpis?.totalRequisitions ?? data?.pagination?.total ?? 0) > 0;
  const hasProcessingBatches = batches.some((b) => b.status === "processing");
  const hasAwaitingReviewBatches = batches.some((b) => b.status === "awaiting_review");
  const hasFailedBatches = batches.some((b) => b.status === "failed");

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button
            onClick={fetchRequisitions}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <DashboardSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <DashboardTopbar
          pageTitle="Requisition Intelligence"
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Overview" }]}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Requisition Intelligence</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Prioritize MSP requisitions using competition, profitability, fillability, bill rate, and contract duration.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <ClearDataButton
                  tenantId={tenantId}
                  onCleared={() => {
                    fetchRequisitions();
                    fetchBatches();
                  }}
                />
                <Link
                  href="/requisitions/import"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <UploadIcon className="w-4 h-4" />
                  Import Requisitions
                </Link>
                <ExportMenu
                  onExport={handleExport}
                  disabled={!hasRequisitions}
                  disabledTooltip="Import and analyze requisitions before exporting."
                />
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <StatCard
                title="Total Requisitions"
                value={kpis.totalRequisitions.toLocaleString()}
                icon={<BriefcaseIcon className="w-5 h-5" />}
                isLoading={loading}
                onClick={() => applyKpiFilter("total")}
                active={activeKpi === "total"}
              />
              <StatCard
                title="New Today"
                value={kpis.newToday.toLocaleString()}
                icon={<SparklesIcon className="w-5 h-5" />}
                accent="success"
                isLoading={loading}
                onClick={() => applyKpiFilter("newToday")}
                active={activeKpi === "newToday"}
              />
              <StatCard
                title="High Priority"
                value={kpis.highPriority.toLocaleString()}
                icon={<TargetIcon className="w-5 h-5" />}
                accent="success"
                isLoading={loading}
                onClick={() => applyKpiFilter("highPriority")}
                active={activeKpi === "highPriority"}
              />
              <StatCard
                title="Negative Profit"
                value={kpis.negativeProfit.toLocaleString()}
                icon={<AlertTriangleIcon className="w-5 h-5" />}
                accent={kpis.negativeProfit > 0 ? "danger" : "default"}
                isLoading={loading}
                onClick={() => applyKpiFilter("negativeProfit")}
                active={activeKpi === "negativeProfit"}
              />
              <StatCard
                title="No Longer Visible"
                value={kpis.noLongerVisible.toLocaleString()}
                icon={<EyeOffIcon className="w-5 h-5" />}
                accent={kpis.noLongerVisible > 0 ? "warning" : "default"}
                isLoading={loading}
                onClick={() => applyKpiFilter("noLongerVisible")}
                active={activeKpi === "noLongerVisible"}
              />
              <StatCard
                title="Avg Score"
                value={kpis.avgScore.toString()}
                icon={<GaugeIcon className="w-5 h-5" />}
                description="Opportunity score"
                isLoading={loading}
                onClick={() => applyKpiFilter("avgScore")}
                active={activeKpi === "avgScore"}
              />
            </div>

            {/* Quick Insights */}
            {hasRequisitions && quickInsights && (
              <div className="mb-6">
                <QuickInsights
                  topOpportunity={quickInsights.topOpportunity}
                  portfolioStats={quickInsights.portfolioStats}
                  competitionStats={quickInsights.competitionStats}
                  isLoading={loading}
                />
              </div>
            )}

            {/* Filters */}
            <div className="mb-6">
              <FilterToolbar
                filters={filters}
                onChange={setFilters}
                customers={customers}
              />
            </div>

            {/* Content Area */}
            <div id="requisition-list" className="space-y-6 scroll-mt-20">
              {!hasRequisitions && !loading && (
                <>
                  {hasProcessingBatches && <ProcessingEmptyState />}
                  {hasAwaitingReviewBatches && (
                    <AwaitingReviewEmptyState 
                      batchId={batches.find(b => b.status === "awaiting_review")?.id || ""} 
                    />
                  )}
                  {hasFailedBatches && (
                    <FailedImportEmptyState 
                      batchId={batches.find(b => b.status === "failed")?.id} 
                    />
                  )}
                  {!hasProcessingBatches && !hasAwaitingReviewBatches && !hasFailedBatches && (
                    <EmptyState />
                  )}
                </>
              )}
              
              {hasRequisitions && hasActiveFilters && data?.requisitions.length === 0 && !loading && (
                <FilteredEmptyState onClearFilters={clearFilters} />
              )}
              
              {(hasRequisitions || loading) && !(hasActiveFilters && data?.requisitions.length === 0 && !loading) && (
                <RequisitionTable
                  data={data}
                  onPageChange={setPage}
                  onRowClick={(id) => {
                    const req = data?.requisitions.find((r) => r.requisition.id === id);
                    if (req) setSelectedRequisition(req);
                  }}
                  isLoading={loading}
                />
              )}

              {!loading && batches.length > 0 && (
                <ImportActivityList batches={batches} isLoading={batchesLoading} />
              )}
            </div>
          </div>
        </main>
      </div>

      <DetailDrawer
        requisition={selectedRequisition}
        isOpen={!!selectedRequisition}
        onClose={() => setSelectedRequisition(null)}
      />
    </div>
  );
}
