"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";
import { ImportLayout } from "@/components/import/ImportLayout";
import { ImportHeader } from "@/components/import/ImportHeader";
import { ImportStepper, ImportStep } from "@/components/import/ImportStepper";
import { ImportProgressCard, ProcessingStage } from "@/components/import/ImportProgressCard";
import { BatchSummaryPanel } from "@/components/import/BatchSummaryPanel";
import { ColumnMappingTable } from "@/components/import/ColumnMappingTable";
import { DataPreviewTable } from "@/components/import/DataPreviewTable";
import { ReviewTable } from "@/components/import/ReviewTable";
import { ReviewSummaryBar } from "@/components/import/ReviewSummaryBar";
import { ClaudeAnalysisProgress } from "@/components/import/ClaudeAnalysisProgress";
import { ImportErrorCard } from "@/components/import/ImportErrorCard";
import { ImportCompletionSummary } from "@/components/import/ImportCompletionSummary";
import { SafeLeaveNotice } from "@/components/import/SafeLeaveNotice";
import { AlertTriangleIcon } from "@/components/ui/icons";

interface ImportSummary {
  fileName: string;
  encoding: string;
  headerMode: string;
  mappingConfidence: string;
  rowsDetected: number;
  validRows: number;
  rowsRequiringReview: number;
  duplicateRequisitionIds: number;
  missingRequisitionIds: number;
  missingBillRates: number;
  dateParsingWarnings: number;
  columnMapping: Array<{
    sourceLabel: string;
    field: string;
    targetLabel: string;
    columnIndex: number;
  }>;
}

interface BatchStatus {
  batch: {
    id: string;
    status: string;
    processingSummary?: {
      files_processed: number;
      screenshots_processed: number;
      spreadsheet_rows_processed: number;
      visible_rows_detected: number;
      potential_duplicates_detected: number;
      uncertain_record_count: number;
      valid_rows?: number;
      rows_requiring_review?: number;
      missing_requisition_ids?: number;
      missing_bill_rates?: number;
      date_parsing_warnings?: number;
      import_summaries?: ImportSummary[];
    };
    mspProgramId: string;
    createdAt?: string;
    representsCompletePortalView?: boolean;
  };
  sourceFiles: Array<{
    id: string;
    originalFilename: string;
    processingStatus: string;
    errorMessage?: string;
  }>;
  sourceRows: Array<{ id: string }>;
}

interface ReviewRow {
  id: string;
  excluded: boolean;
  sourceFilename: string;
  sheetName: string | null;
  rowNumber: number | null;
  data: {
    requisition_id: string | null;
    status: string | null;
    customer: string | null;
    job_title: string | null;
    submissions: number | null;
    c2c_bill_rate: number | null;
    source_c2c_bill_rate?: string | null;
    c2c_bill_rate_normalized?: string | null;
    location: string | null;
    start_date: string | null;
    duration: string | null;
    number_of_positions: number | null;
    active_submissions: number | null;
    released_date: string | null;
    position_type: string | null;
    remote_or_onsite: string | null;
  };
  sourceConfidence: string;
  dataQualityNotes: string[];
  duplicateStatus?: string;
  duplicateMatchReason?: string | null;
  existingRecord?: Record<string, unknown> | null;
}

interface DuplicateSummary {
  newRequisitions: number;
  duplicatesInImport: number;
  existingMatches: number;
  possibleDuplicates: number;
  conflicts: number;
  missingRequisitionId: number;
}

type PageMode = "processing" | "preview" | "review" | "analyzing" | "complete" | "failed";

function formatBillRate(row: ReviewRow["data"]): string {
  if (row.source_c2c_bill_rate) return row.source_c2c_bill_rate;
  if (row.c2c_bill_rate_normalized) return `$${row.c2c_bill_rate_normalized}`;
  if (row.c2c_bill_rate === null || row.c2c_bill_rate === undefined) return "—";
  return `$${Number(row.c2c_bill_rate).toFixed(2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
  }
  return value;
}

function BatchImportPageContent({ params }: { params: Promise<{ batchId: string }> }) {
  const router = useRouter();
  const { tenantId, assumptions, weights } = useAppContext();
  const [batchId, setBatchId] = useState<string>("");
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateSummary | null>(null);
  const [mode, setMode] = useState<PageMode>("processing");
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{
    sourceRowCount: number;
    uniqueRequisitionCount: number;
    analysesCompleted: number;
    analysesPending: number;
    requiresReview: number;
    newRecordsCreated: number;
    existingRecordsUpdated: number;
    duplicatesConsolidated: number;
  } | null>(null);

  useEffect(() => {
    params.then((p) => setBatchId(p.batchId));
  }, [params]);

  const applyBatchStatus = useCallback((batchStatus: string | undefined) => {
    if (!batchStatus) return;
    if (batchStatus === "awaiting_review" || batchStatus === "reviewing") {
      setMode((prev) => (prev === "review" ? "review" : "preview"));
    } else if (batchStatus === "analyzing" || batchStatus === "calculating") {
      setMode("analyzing");
    } else if (batchStatus === "completed" || batchStatus === "partially_completed") {
      setMode("complete");
    } else if (batchStatus === "failed" || batchStatus === "cancelled") {
      setMode("failed");
      setError("Import failed. Please try uploading the file again.");
    } else {
      setMode("processing");
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!batchId) return;
    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_status", tenantId }),
      });
      if (!res.ok) {
        setError("Could not refresh import status. Retrying…");
        return;
      }
      const data = await res.json();
      const payload = data.status;
      setStatus(payload);
      const batchStatus =
        payload?.batch?.status ||
        payload?.status ||
        (typeof payload === "string" ? payload : undefined);
      applyBatchStatus(batchStatus);
    } catch {
      setError("Could not refresh import status. Retrying…");
    }
  }, [batchId, tenantId, applyBatchStatus]);

  const fetchReview = useCallback(async () => {
    if (!batchId) return;
    const res = await fetch(`/api/batches/${batchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_review", tenantId }),
    });
    if (res.ok) {
      const data = await res.json();
      setReviewRows(data.rows || []);
      setDuplicateSummary(data.duplicateSummary || null);
    }
  }, [batchId, tenantId]);

  useEffect(() => {
    if (!batchId) return;
    fetchStatus();
    if (mode === "preview" || mode === "review" || mode === "complete") {
      return;
    }
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [batchId, fetchStatus, mode]);

  useEffect(() => {
    if (mode === "preview" || mode === "review") fetchReview();
  }, [mode, fetchReview]);

  const updateRow = async (rowId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/batches/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId, tenantId, updates }),
    });
    fetchReview();
  };

  const handleConfirmAndAnalyze = async () => {
    if (!status) return;
    setAnalyzing(true);
    setError(null);
    try {
      await fetch(`/api/batches/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_review", tenantId }),
      });

      const res = await fetch(`/api/batches/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          tenantId,
          mspProgramId: status.batch.mspProgramId,
          assumptions,
          weights,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(typeof err.error === "string" ? err.error : "Analysis failed");
      }
      const payload = await res.json();
      if (!payload.summary?.uniqueRequisitionCount) {
        throw new Error("Import finished without saving requisitions");
      }
      setCompletionSummary(payload.summary);
      setMode("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const summary = status?.batch?.processingSummary;
  const importSummary = summary?.import_summaries?.[0];
  const batchStatus = status?.batch?.status || "uploaded";
  const needsReview = reviewRows.filter(
    (r) => !r.excluded && (!r.data.requisition_id || !r.data.c2c_bill_rate)
  );
  const readyRows = reviewRows.filter((r) => !r.excluded && r.data.requisition_id);
  const excludedCount = reviewRows.filter((r) => r.excluded).length;

  const detectedCount =
    importSummary?.rowsDetected ?? summary?.visible_rows_detected ?? reviewRows.length;
  const isRandstad =
    importSummary?.headerMode === "positional_randstad" ||
    (status?.sourceFiles?.[0]?.originalFilename || "").toLowerCase().includes("randstad");

  // Map batch status to step
  const currentStep: ImportStep = useMemo(() => {
    if (mode === "processing") {
      if (batchStatus === "uploaded" || batchStatus === "validating") return "upload";
      if (batchStatus === "parsing") return "detect";
      return "detect";
    }
    if (mode === "preview") return "preview";
    if (mode === "review") return "review";
    if (mode === "analyzing") return "analyze";
    if (mode === "complete") return "complete";
    if (mode === "failed") return "review";
    return "upload";
  }, [mode, batchStatus]);

  // Build processing stages
  const processingStages: ProcessingStage[] = useMemo(() => {
    const stageIndex: Record<string, number> = {
      uploaded: 0,
      validating: 0,
      parsing: 1,
      extracting: 2,
      analyzing: 3,
      calculating: 3,
      awaiting_review: 4,
      reviewing: 4,
      completed: 4,
    };
    const currentIdx = stageIndex[batchStatus] ?? 0;

    const stages = [
      { id: "upload", label: "File uploaded", detail: status?.sourceFiles?.[0]?.originalFilename },
      { id: "detect", label: "Detecting file format", detail: importSummary?.encoding ? `Encoding: ${importSummary.encoding}` : undefined },
      { id: "map", label: "Mapping requisition columns", detail: detectedCount ? `${detectedCount} requisition rows found` : undefined },
      { id: "normalize", label: "Normalizing rates and dates" },
      { id: "dedupe", label: "Checking duplicates", detail: summary?.potential_duplicates_detected !== undefined ? `${summary.potential_duplicates_detected} duplicate IDs detected` : undefined },
      { id: "prepare", label: "Preparing review" },
    ];

    return stages.map((stage, i) => ({
      ...stage,
      status: (i < currentIdx ? "complete" : i === currentIdx ? "active" : "pending") as ProcessingStage["status"],
    }));
  }, [batchStatus, status, importSummary, detectedCount, summary]);

  // Build analysis stages
  const analysisStages = [
    { id: "prepare", label: "Preparing confirmed data", status: "complete" as const },
    { id: "send1", label: "Sending batch 1 to Claude", status: "active" as const },
    { id: "validate1", label: "Validating batch 1 response", status: "pending" as const },
    { id: "calc", label: "Calculating profitability", status: "pending" as const },
    { id: "rank", label: "Ranking opportunities", status: "pending" as const },
    { id: "save", label: "Saving results", status: "pending" as const },
  ];

  // Preview rows
  const previewRows = useMemo(
    () =>
      reviewRows.slice(0, 10).map((r) => ({
        id: r.id,
        status: r.data.status,
        requisitionId: r.data.requisition_id,
        customer: r.data.customer,
        jobTitle: r.data.job_title,
        submissions: r.data.submissions,
        billRate: formatBillRate(r.data),
        location: r.data.location,
        duration: r.data.duration,
        releasedDate: r.data.released_date ? formatDate(r.data.released_date) : null,
      })),
    [reviewRows]
  );

  // Column mappings with confidence
  const columnMappings = useMemo(() => {
    if (!importSummary?.columnMapping) return [];
    return importSummary.columnMapping.map((m) => ({
      ...m,
      confidence: (importSummary.mappingConfidence === "high" ? "high" : "medium") as "high" | "medium" | "low",
      sampleValue: undefined as string | undefined,
    }));
  }, [importSummary]);

  if (!batchId) return null;

  return (
    <ImportLayout
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      pageTitle="Import Requisitions"
      breadcrumbs={[
        { label: "Requisitions", href: "/requisitions" },
        { label: "Import", href: "/requisitions/import" },
        { label: batchId.slice(0, 8) },
      ]}
    >
      <ImportHeader
        batchId={batchId}
        showNewImport={mode === "complete" || mode === "failed"}
      />

      {/* Stepper */}
      <div className="mb-8">
        <ImportStepper
          currentStep={currentStep}
          failedStep={mode === "failed" ? "review" : undefined}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Main Workflow */}
        <div className="space-y-6">
          {/* Processing State */}
          {mode === "processing" && (
            <>
              <ImportProgressCard
                title="Reading your Randstad export"
                subtitle="We are detecting file encoding, headers, and requisition rows."
                stages={processingStages}
                currentFile={status?.sourceFiles?.[0]?.originalFilename}
                fileProgress={{
                  current: summary?.files_processed ?? 0,
                  total: status?.sourceFiles?.length ?? 1,
                }}
                rowCount={detectedCount}
                warningCount={summary?.uncertain_record_count}
              />
              <SafeLeaveNotice />
            </>
          )}

          {/* Preview State */}
          {mode === "preview" && (
            <>
              {columnMappings.length > 0 && (
                <ColumnMappingTable
                  mappings={columnMappings}
                  rowCount={detectedCount}
                  encoding={importSummary?.encoding}
                  isRandstad={isRandstad}
                />
              )}
              <DataPreviewTable rows={previewRows} />
              <div className="flex justify-between">
                <Link
                  href="/requisitions/import"
                  className="px-6 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back
                </Link>
                <button
                  type="button"
                  onClick={() => setMode("review")}
                  className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Continue to Review
                </button>
              </div>
            </>
          )}

          {/* Review State */}
          {mode === "review" && (
            <>
              <ReviewSummaryBar
                total={reviewRows.length}
                valid={readyRows.length}
                needsReview={needsReview.length}
                excluded={excludedCount}
                canConfirm={readyRows.length > 0 && needsReview.length === 0}
                blockingError={
                  needsReview.length > 0
                    ? `Resolve ${needsReview.length} missing ${needsReview.length === 1 ? "issue" : "issues"} before continuing.`
                    : undefined
                }
                onBack={() => setMode("preview")}
                onConfirm={handleConfirmAndAnalyze}
                isConfirming={analyzing}
              />

              {duplicateSummary && (
                <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-4">
                  <h2 className="text-sm font-bold text-slate-900 mb-3">
                    Import Summary
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      ["New", duplicateSummary.newRequisitions],
                      ["Duplicates in Import", duplicateSummary.duplicatesInImport],
                      ["Existing Matches", duplicateSummary.existingMatches],
                      ["Possible", duplicateSummary.possibleDuplicates],
                      ["Conflicts", duplicateSummary.conflicts],
                      ["Missing IDs", duplicateSummary.missingRequisitionId],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-xl font-bold text-slate-900 tabular-nums">
                          {Number(value).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-600">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-bold text-red-800">{error}</p>
                </div>
              )}

              <ReviewTable
                rows={reviewRows}
                onUpdate={updateRow}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedRowId}
              />
            </>
          )}

          {/* Analyzing State */}
          {mode === "analyzing" && (
            <>
              <ClaudeAnalysisProgress
                totalRequisitions={readyRows.length || detectedCount}
                analyzedCount={0}
                stages={analysisStages}
              />
              <SafeLeaveNotice />
            </>
          )}

          {/* Failed State */}
          {mode === "failed" && (
            <ImportErrorCard
              title="Import could not be completed"
              message={error || "An error occurred during processing."}
              batchId={batchId}
              preservedCount={reviewRows.length}
              onRetry={() => {
                setError(null);
                setMode("processing");
                fetchStatus();
              }}
              onReturnToReview={() => setMode("review")}
            />
          )}

          {/* Complete State */}
          {mode === "complete" && completionSummary && (
            <ImportCompletionSummary
              newRecordsCreated={completionSummary.newRecordsCreated}
              existingRecordsUpdated={completionSummary.existingRecordsUpdated}
              duplicatesConsolidated={completionSummary.duplicatesConsolidated}
              payRangesGenerated={completionSummary.analysesCompleted}
              recordsNeedingReview={completionSummary.requiresReview}
              onViewResults={() => router.push("/?imported=1")}
              onReviewIssues={completionSummary.requiresReview > 0 ? () => setMode("review") : undefined}
              onNewImport={() => router.push("/requisitions/import")}
            />
          )}
        </div>

        {/* Right: Batch Summary Sidebar */}
        <div className="space-y-6">
          {status && (
            <BatchSummaryPanel
              batchId={batchId}
              fileCount={status.sourceFiles?.length ?? 0}
              status={batchStatus}
              rowsDetected={detectedCount}
              rowsValid={summary?.valid_rows ?? importSummary?.validRows}
              rowsNeedingReview={summary?.rows_requiring_review ?? importSummary?.rowsRequiringReview}
              duplicateIds={summary?.potential_duplicates_detected ?? importSummary?.duplicateRequisitionIds}
              warnings={summary?.uncertain_record_count}
              sourceFilename={status.sourceFiles?.[0]?.originalFilename}
              detectedEncoding={importSummary?.encoding}
              isCompleteList={status.batch.representsCompletePortalView}
              startedAt={status.batch.createdAt}
            />
          )}

          {/* File Status */}
          {status?.sourceFiles?.some((f) => f.processingStatus === "failed") && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-800">File processing error</p>
                  <p className="text-xs font-medium text-red-700 mt-1">
                    {status.sourceFiles
                      .filter((f) => f.processingStatus === "failed")
                      .map((f) => f.errorMessage || "We could not read this file.")
                      .join(" ")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ImportLayout>
  );
}

export default function BatchImportPage({ params }: { params: Promise<{ batchId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-200 rounded-full mb-4" />
            <div className="h-4 w-32 bg-slate-200 rounded" />
          </div>
        </div>
      }
    >
      <BatchImportPageContent params={params} />
    </Suspense>
  );
}
