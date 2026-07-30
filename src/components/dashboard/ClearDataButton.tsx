"use client";

import { useState } from "react";
import { TrashIcon, XIcon, AlertTriangleIcon, LoaderIcon } from "@/components/ui/icons";
import type { ClearScope } from "@/lib/clear-data-scopes";

const OPTIONS: Array<{
  id: ClearScope;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "Everything (recommended reset)",
    description:
      "Imports, requisitions, analysis, snapshots, audit logs, and aliases. Keeps tenant, Randstad program, and assumptions.",
  },
  {
    id: "imports",
    label: "Imports only",
    description: "Batches, uploaded files, and source rows (import history).",
  },
  {
    id: "requisitions",
    label: "Requisitions only",
    description: "Authoritative requisitions, analysis results, snapshots, and overrides.",
  },
  {
    id: "audit",
    label: "Audit logs",
    description: "Activity / audit log entries for this tenant.",
  },
  {
    id: "aliases",
    label: "Customer aliases",
    description: "Normalized customer alias mappings.",
  },
];

interface ClearDataButtonProps {
  tenantId: string;
  onCleared?: () => void;
}

export function ClearDataButton({ tenantId, onCleared }: ClearDataButtonProps) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<ClearScope[]>(["all"]);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const toggleScope = (id: ClearScope) => {
    setResultMessage(null);
    setError(null);
    if (id === "all") {
      setScopes(["all"]);
      return;
    }
    setScopes((prev) => {
      const withoutAll = prev.filter((s) => s !== "all");
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter((s) => s !== id);
        return next.length === 0 ? ["all"] : next;
      }
      return [...withoutAll, id];
    });
  };

  const close = () => {
    if (loading) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
    setResultMessage(null);
    setScopes(["all"]);
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setLoading(true);
    setError(null);
    setResultMessage(null);
    try {
      const response = await fetch("/api/data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          scopes,
          confirm: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete data"
        );
      }
      setResultMessage(data.message || `Deleted ${data.totalDeleted} records`);
      onCleared?.();
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
      >
        <TrashIcon className="w-4 h-4" />
        Delete data
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-data-title"
            className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangleIcon className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 id="clear-data-title" className="text-lg font-semibold text-slate-900">
                    Delete database data
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Choose what to remove. Seed configuration (tenant, Randstad program, assumptions) is kept.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                aria-label="Close"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {OPTIONS.map((opt) => {
                const checked = scopes.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 text-red-600 border-slate-300 rounded"
                      checked={checked}
                      onChange={() => toggleScope(opt.id)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {opt.label}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {opt.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 space-y-3 bg-slate-50">
              <label className="block text-sm text-slate-700">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={loading}
                />
              </label>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              {resultMessage && (
                <p className="text-sm text-emerald-700">{resultMessage}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {resultMessage ? "Close" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading || confirmText !== "DELETE" || scopes.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <LoaderIcon className="w-4 h-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <TrashIcon className="w-4 h-4" />
                      Delete selected
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
