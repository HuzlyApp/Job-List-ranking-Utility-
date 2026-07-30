"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useAppContext } from "@/lib/app-context";
import { HistoryIcon } from "@/components/ui/icons";

interface Batch {
  id: string;
  status: string;
  filesCount: number | null;
  createdAt: string;
  completedAt: string | null;
  sanitizedErrorMessage: string | null;
  processingSummary: {
    sourceRowCount?: number;
    uniqueRequisitionCount?: number;
    originalFilename?: string;
    visible_rows_detected?: number;
  } | null;
}

export default function HistoryPage() {
  const { tenantId } = useAppContext();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/batches?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load import history");
        const data = await res.json();
        if (!cancelled) setBatches(data.batches || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <AppShell
      pageTitle="Import History"
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "History" }]}
      actions={
        <Link
          href="/requisitions/import"
          className="inline-flex px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
        >
          New import
        </Link>
      }
    >
      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading history…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          {error}
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <HistoryIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">No imports yet</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Upload a Randstad export to start ranking requisitions.
          </p>
          <Link
            href="/requisitions/import"
            className="inline-flex px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Import requisitions
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Batch</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Files</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Rows</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Created</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {batch.processingSummary?.originalFilename ||
                      `Import ${batch.id.slice(0, 8)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{batch.filesCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {batch.processingSummary?.sourceRowCount ??
                      batch.processingSummary?.visible_rows_detected ??
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(batch.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/requisitions/import/${batch.id}`}
                      className="text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
