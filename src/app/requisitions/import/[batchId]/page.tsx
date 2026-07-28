"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";

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
    };
    mspProgramId: string;
  };
  sourceFiles: Array<{ id: string; originalFilename: string; processingStatus: string; errorMessage?: string }>;
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
  "Uploading files",
  "Parsing spreadsheet rows",
  "Reading screenshots with Claude",
  "Validating extracted data",
  "Finding duplicates",
  "Preparing review",
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
      return 5;
    case "reviewing":
    case "analyzing":
    case "calculating":
      return 3;
    case "completed":
      return 5;
    default:
      return 0;
  }
}

export default function BatchImportPage({ params }: { params: Promise<{ batchId: string }> }) {
  const router = useRouter();
  const { tenantId, assumptions, weights } = useAppContext();
  const [batchId, setBatchId] = useState<string>("");
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [mode, setMode] = useState<"processing" | "review" | "analyzing" | "complete">("processing");
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
      setMode("review");
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
    if (mode === "review") fetchReview();
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

  const batchStatus = status?.batch?.status || "uploaded";
  const summary = status?.batch?.processingSummary;
  const currentStage = stageIndex(batchStatus);
  const needsReview = reviewRows.filter(
    (r) => !r.excluded && (!r.data.requisition_id || !r.data.c2c_bill_rate)
  );
  const readyRows = reviewRows.filter((r) => !r.excluded && r.data.requisition_id);

  if (!batchId) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/requisitions/import" className="text-sm text-blue-600 hover:underline">
            ← New Import
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Import Progress</h1>
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
                {status.sourceFiles.filter((f) => f.processingStatus === "failed").length} file(s)
                failed processing.
              </p>
            )}
          </section>
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
              <button
                type="button"
                disabled={analyzing || readyRows.length === 0}
                onClick={handleConfirmAndAnalyze}
                className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {analyzing ? "Analyzing…" : "Confirm and Analyze"}
              </button>
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
              <ReviewTable rows={reviewRows.filter((r) => !needsReview.includes(r))} onUpdate={updateRow} />
            </section>
          </>
        )}
      </main>
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
                  <span className="text-gray-400 block">{row.sheetName}:{row.rowNumber}</span>
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
                  className="w-16 border rounded px-1 py-0.5"
                  type="number"
                  step="0.01"
                  value={row.data.c2c_bill_rate ?? ""}
                  onChange={(e) =>
                    onUpdate(row.id, {
                      c2c_bill_rate: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                />
              </td>
              <td className="px-2 py-2">{row.data.location || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
