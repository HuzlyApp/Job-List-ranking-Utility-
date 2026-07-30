"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";

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
}

const STAGES = [
  "Reading your Randstad export",
  "Detecting requisition columns",
  "Cleaning rates and dates",
  "Checking for duplicate requisitions",
  "Preparing your review",
];

function stageIndex(status: string): number {
  switch (status) {
    case "uploaded":
    case "validating":
      return 0;
    case "parsing":
      return 1;
    case "extracting":
      return 2;
    case "awaiting_review":
    case "reviewing":
      return 4;
    case "analyzing":
    case "calculating":
      return 3;
    case "completed":
      return 4;
    default:
      return 0;
  }
}

function formatBillRate(row: ReviewRow["data"]): string {
  if (row.source_c2c_bill_rate) return row.source_c2c_bill_rate;
  if (row.c2c_bill_rate_normalized) return `$${row.c2c_bill_rate_normalized}`;
  if (row.c2c_bill_rate === null || row.c2c_bill_rate === undefined) return "—";
  return `$${Number(row.c2c_bill_rate).toFixed(2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  // Prefer display as M/D/YYYY from ISO
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
  }
  return value;
}

export default function BatchImportPage({ params }: { params: Promise<{ batchId: string }> }) {
  const router = useRouter();
  const { tenantId, assumptions, weights } = useAppContext();
  const [batchId, setBatchId] = useState<string>("");
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [mode, setMode] = useState<"processing" | "preview" | "review" | "analyzing" | "complete">(
    "processing"
  );
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    params.then((p) => setBatchId(p.batchId));
  }, [params]);

  const fetchStatus = useCallback(async () => {
    if (!batchId) return;
    const res = await fetch(`/api/batches/${batchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_status", tenantId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setStatus(data.status);

    const batchStatus = data.status?.batch?.status;
    if (batchStatus === "awaiting_review" || batchStatus === "reviewing") {
      setMode((prev) => (prev === "review" ? "review" : "preview"));
    } else if (batchStatus === "analyzing" || batchStatus === "calculating") {
      setMode("analyzing");
    } else if (batchStatus === "completed") {
      setMode("complete");
    } else {
      setMode("processing");
    }
  }, [batchId, tenantId]);

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
    }
  }, [batchId, tenantId]);

  useEffect(() => {
    if (!batchId) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [batchId, fetchStatus]);

  useEffect(() => {
    if (mode === "preview" || mode === "review") fetchReview();
  }, [mode, fetchReview]);

  useEffect(() => {
    if (mode === "complete") {
      router.push("/?imported=1");
    }
  }, [mode, router]);

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
  const currentStage = stageIndex(batchStatus);
  const needsReview = reviewRows.filter(
    (r) => !r.excluded && (!r.data.requisition_id || !r.data.c2c_bill_rate)
  );
  const readyRows = reviewRows.filter((r) => !r.excluded && r.data.requisition_id);
  const previewRows = useMemo(() => reviewRows.slice(0, 10), [reviewRows]);

  const detectedCount =
    importSummary?.rowsDetected ?? summary?.visible_rows_detected ?? reviewRows.length;
  const isRandstad =
    importSummary?.headerMode === "positional_randstad" ||
    (status?.sourceFiles?.[0]?.originalFilename || "").toLowerCase().includes("randstad");

  if (!batchId) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/requisitions/import" className="text-sm text-blue-600 hover:underline">
            ← New Import
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Import Progress</h1>
          <ol className="flex flex-wrap gap-2 text-xs mt-3">
            {[
              "Upload File",
              "Detect File Format",
              "Preview Columns",
              "Review Requisitions",
              "Analyze With Claude",
              "View Ranked Results",
            ].map((step, i) => {
              const active =
                (mode === "processing" && i <= 1) ||
                (mode === "preview" && i === 2) ||
                (mode === "review" && i === 3) ||
                (mode === "analyzing" && i === 4) ||
                (mode === "complete" && i === 5);
              return (
                <li
                  key={step}
                  className={`px-2 py-1 rounded-full ${active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}
                >
                  {step}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {(mode === "processing" || mode === "analyzing") && (
          <section className="bg-white rounded-lg border p-6 space-y-4">
            <h2 className="font-semibold text-lg">
              {mode === "analyzing" ? "Analyzing requisitions…" : "Processing import"}
            </h2>
            <ul className="space-y-2">
              {STAGES.map((stage, i) => (
                <li
                  key={stage}
                  className={`flex items-center gap-2 text-sm ${i <= currentStage ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${i < currentStage ? "bg-green-500" : i === currentStage ? "bg-blue-500 animate-pulse" : "bg-gray-300"}`}
                  />
                  {stage}
                </li>
              ))}
            </ul>
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-4 border-t">
                <div>
                  <p className="text-gray-500">Files processed</p>
                  <p className="font-semibold">{summary.files_processed}</p>
                </div>
                <div>
                  <p className="text-gray-500">Rows extracted</p>
                  <p className="font-semibold">{summary.visible_rows_detected}</p>
                </div>
                <div>
                  <p className="text-gray-500">Duplicates found</p>
                  <p className="font-semibold">{summary.potential_duplicates_detected}</p>
                </div>
                <div>
                  <p className="text-gray-500">Warnings</p>
                  <p className="font-semibold">{summary.uncertain_record_count}</p>
                </div>
              </div>
            )}
            {status?.sourceFiles.some((f) => f.processingStatus === "failed") && (
              <p className="text-red-600 text-sm">
                {status.sourceFiles
                  .filter((f) => f.processingStatus === "failed")
                  .map((f) => f.errorMessage || "We could not read this file.")
                  .join(" ")}
              </p>
            )}
          </section>
        )}

        {mode === "preview" && (
          <>
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-lg">Column Mapping Preview</h2>
                <p className="text-sm text-gray-700 mt-1">
                  We detected {detectedCount} requisition rows
                  {isRandstad ? " from your Randstad file" : ""}.
                </p>
                {importSummary?.headerMode === "positional_randstad" && (
                  <p className="text-sm text-green-700 mt-1">
                    Recognized as a Randstad requisition export (no header row required).
                  </p>
                )}
              </div>

              {(importSummary?.columnMapping?.length || 0) > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Source column</th>
                        <th className="px-3 py-2 text-left">Maps to</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importSummary!.columnMapping.map((m) => (
                        <tr key={m.field}>
                          <td className="px-3 py-2">{m.sourceLabel}</td>
                          <td className="px-3 py-2">{m.targetLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importSummary?.mappingConfidence === "low" && (
                <p className="text-sm text-amber-700">
                  Detection confidence is low. You can correct values on the next review step.
                </p>
              )}

              <ImportSummaryCard
                summary={summary}
                importSummary={importSummary}
                filename={status?.sourceFiles?.[0]?.originalFilename}
              />
            </section>

            <section className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h3 className="font-semibold">Data Preview (first 10 records)</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Please review the detected fields before continuing. You can correct any value
                  during the review step.
                </p>
              </div>
              <PreviewTable rows={previewRows} />
            </section>

            <div className="flex justify-between">
              <Link
                href="/requisitions/import"
                className="px-6 py-2 border rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Back
              </Link>
              <button
                type="button"
                onClick={() => setMode("review")}
                className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700"
              >
                Continue to Review
              </button>
            </div>
          </>
        )}

        {mode === "review" && (
          <>
            <section className="bg-white rounded-lg border p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">{readyRows.length} records ready for analysis</p>
                {needsReview.length > 0 && (
                  <p className="text-sm text-amber-600">
                    {needsReview.length} record(s) need review (missing Req ID or bill rate)
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("preview")}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={analyzing || readyRows.length === 0}
                  onClick={handleConfirmAndAnalyze}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {analyzing ? "Analyzing…" : "Confirm and Analyze"}
                </button>
              </div>
            </section>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {needsReview.length > 0 && (
              <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 mb-3">Needs Review</h3>
                <ReviewTable rows={needsReview} onUpdate={updateRow} highlight />
              </section>
            )}

            <section className="bg-white rounded-lg border overflow-hidden">
              <h3 className="font-semibold px-4 py-3 border-b bg-gray-50">Extracted Records</h3>
              <ReviewTable
                rows={reviewRows.filter((r) => !needsReview.includes(r))}
                onUpdate={updateRow}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ImportSummaryCard({
  summary,
  importSummary,
  filename,
}: {
  summary?: BatchStatus["batch"]["processingSummary"];
  importSummary?: ImportSummary;
  filename?: string;
}) {
  return (
    <div className="border rounded-md p-4 bg-gray-50 text-sm space-y-1">
      <h3 className="font-semibold text-base mb-2">Import Summary</h3>
      <p>
        <span className="text-gray-500">File:</span>{" "}
        {importSummary?.fileName || filename || "—"}
      </p>
      <p>
        <span className="text-gray-500">Encoding:</span> {importSummary?.encoding || "UTF-8"}
      </p>
      <p>
        <span className="text-gray-500">Requisition rows detected:</span>{" "}
        {importSummary?.rowsDetected ?? summary?.visible_rows_detected ?? 0}
      </p>
      <p>
        <span className="text-gray-500">Valid rows:</span>{" "}
        {importSummary?.validRows ?? summary?.valid_rows ?? 0}
      </p>
      <p>
        <span className="text-gray-500">Duplicate IDs:</span>{" "}
        {importSummary?.duplicateRequisitionIds ??
          summary?.potential_duplicates_detected ??
          0}
      </p>
      <p>
        <span className="text-gray-500">Rows requiring review:</span>{" "}
        {importSummary?.rowsRequiringReview ?? summary?.rows_requiring_review ?? 0}
      </p>
      <p>
        <span className="text-gray-500">Missing Requisition IDs:</span>{" "}
        {importSummary?.missingRequisitionIds ?? summary?.missing_requisition_ids ?? 0}
      </p>
      <p>
        <span className="text-gray-500">Missing bill rates:</span>{" "}
        {importSummary?.missingBillRates ?? summary?.missing_bill_rates ?? 0}
      </p>
      <p>
        <span className="text-gray-500">Date parsing warnings:</span>{" "}
        {importSummary?.dateParsingWarnings ?? summary?.date_parsing_warnings ?? 0}
      </p>
    </div>
  );
}

function PreviewTable({ rows }: { rows: ReviewRow[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">No rows to display.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left">Status</th>
            <th className="px-2 py-2 text-left">Requisition ID</th>
            <th className="px-2 py-2 text-left">Customer</th>
            <th className="px-2 py-2 text-left">Job Title</th>
            <th className="px-2 py-2 text-left">Submissions</th>
            <th className="px-2 py-2 text-left">C2C Bill Rate</th>
            <th className="px-2 py-2 text-left">Location</th>
            <th className="px-2 py-2 text-left">Start Date</th>
            <th className="px-2 py-2 text-left">Duration</th>
            <th className="px-2 py-2 text-left">Positions</th>
            <th className="px-2 py-2 text-left">Active Submissions</th>
            <th className="px-2 py-2 text-left">Released Date</th>
            <th className="px-2 py-2 text-left">Position Type</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-2 py-2">{row.data.status || "—"}</td>
              <td className="px-2 py-2">{row.data.requisition_id || "—"}</td>
              <td className="px-2 py-2">{row.data.customer || "—"}</td>
              <td className="px-2 py-2 max-w-[140px] truncate">{row.data.job_title || "—"}</td>
              <td className="px-2 py-2">{row.data.submissions ?? "—"}</td>
              <td className="px-2 py-2">{formatBillRate(row.data)}</td>
              <td className="px-2 py-2">{row.data.location || "—"}</td>
              <td className="px-2 py-2">{formatDate(row.data.start_date)}</td>
              <td className="px-2 py-2">{row.data.duration || "—"}</td>
              <td className="px-2 py-2">{row.data.number_of_positions ?? "—"}</td>
              <td className="px-2 py-2">{row.data.active_submissions ?? "—"}</td>
              <td className="px-2 py-2">{formatDate(row.data.released_date)}</td>
              <td className="px-2 py-2">{row.data.position_type || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewTable({
  rows,
  onUpdate,
  highlight,
}: {
  rows: ReviewRow[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  highlight?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">No rows to display.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left">Include</th>
            <th className="px-2 py-2 text-left">Source</th>
            <th className="px-2 py-2 text-left">Conf.</th>
            <th className="px-2 py-2 text-left">Req ID</th>
            <th className="px-2 py-2 text-left">Customer</th>
            <th className="px-2 py-2 text-left">Job Title</th>
            <th className="px-2 py-2 text-left">Subs</th>
            <th className="px-2 py-2 text-left">Bill Rate</th>
            <th className="px-2 py-2 text-left">Location</th>
            <th className="px-2 py-2 text-left">Start</th>
            <th className="px-2 py-2 text-left">Duration</th>
            <th className="px-2 py-2 text-left">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className={highlight ? "bg-amber-50" : ""}>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={!row.excluded}
                  onChange={(e) => onUpdate(row.id, { excluded: !e.target.checked })}
                />
              </td>
              <td className="px-2 py-2 max-w-[100px] truncate" title={row.sourceFilename}>
                {row.sourceFilename}
                {row.sheetName && (
                  <span className="text-gray-400 block">
                    {row.sheetName}:{row.rowNumber}
                  </span>
                )}
              </td>
              <td className="px-2 py-2">{row.sourceConfidence}</td>
              <td className="px-2 py-2">
                <input
                  className="w-24 border rounded px-1 py-0.5"
                  value={row.data.requisition_id || ""}
                  onChange={(e) => onUpdate(row.id, { requisition_id: e.target.value || null })}
                />
              </td>
              <td className="px-2 py-2">{row.data.customer || "—"}</td>
              <td className="px-2 py-2 max-w-[150px] truncate">{row.data.job_title || "—"}</td>
              <td className="px-2 py-2">{row.data.submissions ?? "—"}</td>
              <td className="px-2 py-2">
                <input
                  className="w-20 border rounded px-1 py-0.5"
                  value={
                    row.data.c2c_bill_rate_normalized ||
                    (row.data.c2c_bill_rate != null ? String(row.data.c2c_bill_rate) : "")
                  }
                  onChange={(e) =>
                    onUpdate(row.id, {
                      c2c_bill_rate: e.target.value ? parseFloat(e.target.value) : null,
                      c2c_bill_rate_normalized: e.target.value || null,
                    })
                  }
                />
              </td>
              <td className="px-2 py-2">{row.data.location || "—"}</td>
              <td className="px-2 py-2">{formatDate(row.data.start_date)}</td>
              <td className="px-2 py-2">{row.data.duration || "—"}</td>
              <td className="px-2 py-2">{row.data.position_type || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
