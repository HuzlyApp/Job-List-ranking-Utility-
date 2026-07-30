"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";
import { validateUploadFile, MAX_FILE_SIZE } from "@/lib/file-validation";
import { ImportLayout } from "@/components/import/ImportLayout";
import { ImportHeader } from "@/components/import/ImportHeader";
import { ImportStepper } from "@/components/import/ImportStepper";
import {
  UploadIcon,
  ImageIcon,
  FileSpreadsheetIcon,
  TrashIcon,
  AlertTriangleIcon,
  CheckIcon,
  LoaderIcon,
  DownloadIcon,
} from "@/components/ui/icons";

interface SelectedFile {
  file: File;
  error?: string;
  preview?: string;
}

function ImportPageContent() {
  const router = useRouter();
  const { tenantId, userId, defaultMspProgramId } = useAppContext();
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [mspProgramId, setMspProgramId] = useState(defaultMspProgramId);
  const [completeList, setCompleteList] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/setup").then(() =>
      fetch(`/api/msp-programs?tenantId=${tenantId}`)
        .then((r) => r.json())
        .then((d) => {
          setPrograms(d.programs || []);
          if (d.programs?.length) setMspProgramId(d.programs[0].id);
        })
    );
  }, [tenantId]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const next: SelectedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        next.push({ file, error: "The image is too large." });
        continue;
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      const validation = validateUploadFile(file.name, file.type, file.size, buffer);
      const entry: SelectedFile = { file, error: validation.error };
      if (file.type.startsWith("image/")) {
        entry.preview = URL.createObjectURL(file);
      }
      next.push(entry);
    }
    setSelectedFiles((prev) => [...prev, ...next]);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const validFiles = selectedFiles.filter((f) => !f.error);
  const canSubmit = validFiles.length > 0 && !!mspProgramId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const batchRes = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          mspProgramId,
          createdBy: userId,
          representsCompletePortalView: completeList,
        }),
      });
      if (!batchRes.ok) throw new Error("Failed to create import batch");
      const { batch } = await batchRes.json();

      const formData = new FormData();
      formData.append(
        "meta",
        JSON.stringify({ tenantId, mspProgramId, createdBy: userId, representsCompletePortalView: completeList })
      );
      for (const { file } of validFiles) {
        formData.append("files", file);
      }

      const uploadRes = await fetch(`/api/batches/${batch.id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error?.toString() || "Upload failed");
      }

      router.push(`/requisitions/import/${batch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImportLayout
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      pageTitle="Import Requisitions"
      breadcrumbs={[
        { label: "Requisitions", href: "/requisitions" },
        { label: "Import" },
      ]}
    >
      <ImportHeader />

      {/* Stepper */}
      <div className="mb-8">
        <ImportStepper currentStep="upload" />
      </div>

      {/* Main Upload Card */}
      <div className="max-w-3xl">
        <div className="bg-white border border-slate-300 rounded-xl shadow-sm p-6 space-y-6">
          {/* MSP Program Selector */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              MSP Program
            </label>
            <select
              value={mspProgramId}
              onChange={(e) => setMspProgramId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-medium text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {!programs.length && (
                <option value={defaultMspProgramId}>Randstad iLabor</option>
              )}
            </select>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
              ${dragOver
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
              }
            `}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <UploadIcon className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-slate-900 mb-1">
                Drop files here or click to browse
              </p>
              <p className="text-sm font-medium text-slate-600 mb-4 max-w-md">
                Upload screenshots from your MSP portal or spreadsheets containing requisition data.
                Duplicate requisitions will be consolidated by Requisition ID.
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg cursor-pointer hover:bg-emerald-700 transition-colors text-sm font-bold">
                <UploadIcon className="w-4 h-4" />
                Choose Files
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </label>
              <div className="flex items-center gap-4 mt-4 flex-wrap justify-center">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                  <ImageIcon className="w-4 h-4" />
                  PNG, JPG, WEBP
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                  <FileSpreadsheetIcon className="w-4 h-4" />
                  XLSX, XLS, CSV
                </span>
              </div>
              <a
                href="/api/templates/sample-requisitions"
                download="sample-requisition-import.csv"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800"
              >
                <DownloadIcon className="w-4 h-4" />
                Download sample CSV template
              </a>
            </div>
          </div>

          {/* File List */}
          {selectedFiles.length > 0 && (
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900">
                  Selected Files ({selectedFiles.length})
                </h3>
              </div>
              <ul className="divide-y divide-slate-200">
                {selectedFiles.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    {item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview}
                        alt=""
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                        <FileSpreadsheetIcon className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {item.file.name}
                      </p>
                      <p className="text-xs font-medium text-slate-600">
                        {(item.file.size / 1024).toFixed(1)} KB
                        {item.error && (
                          <span className="text-red-700 font-bold ml-2">• {item.error}</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Remove file"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Complete List Option */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={completeList}
              onChange={(e) => setCompleteList(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-400 rounded focus:ring-emerald-500"
            />
            <div>
              <p className="text-sm font-bold text-slate-900">
                This upload represents the complete current requisition list
              </p>
              <p className="text-xs font-medium text-slate-600 mt-1">
                Enable this only when the uploaded files contain the complete current portal list.
                Missing requisitions may then be marked as No Longer Visible.
              </p>
              <a
                href="/api/templates/sample-requisitions"
                download="sample-requisition-import.csv"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download a sample complete-list CSV to try this option
              </a>
            </div>
          </label>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-800">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2
              ${canSubmit
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
              }
            `}
          >
            {submitting ? (
              <>
                <LoaderIcon className="w-4 h-4" />
                Starting Import…
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4" />
                Start Import
              </>
            )}
          </button>
        </div>

        {/* Help Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">Supported File Types</p>
              <p className="text-xs font-medium text-blue-800 mt-1">
                Screenshots (PNG, JPG, WEBP) and spreadsheets (XLSX, XLS, CSV) are supported.
                You may upload multiple files, including overlapping screenshots.
                Prefer the{" "}
                <a
                  href="/api/templates/sample-requisitions"
                  download="sample-requisition-import.csv"
                  className="underline font-bold hover:text-blue-950"
                >
                  sample CSV template
                </a>{" "}
                if you are building a file from scratch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ImportLayout>
  );
}

export default function ImportPage() {
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
      <ImportPageContent />
    </Suspense>
  );
}
