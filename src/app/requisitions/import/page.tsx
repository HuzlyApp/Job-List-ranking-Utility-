"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";
import { validateUploadFile, MAX_FILE_SIZE } from "@/lib/file-validation";

interface SelectedFile {
  file: File;
  error?: string;
  preview?: string;
}

export default function ImportPage() {
  const router = useRouter();
  const { tenantId, userId, defaultMspProgramId } = useAppContext();
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [mspProgramId, setMspProgramId] = useState(defaultMspProgramId);
  const [completeList, setCompleteList] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const validation = validateUploadFile(
        file.name,
        file.type,
        file.size,
        buffer
      );
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
  const canSubmit = validFiles.length > 0 && mspProgramId && !submitting;

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Import Requisitions</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Stepper */}
        <ol className="flex gap-2 text-sm">
          {["Upload Files", "Parse and Extract", "Review Data", "Analyze", "Complete"].map(
            (step, i) => (
              <li
                key={step}
                className={`px-3 py-1 rounded-full ${i === 0 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}
              >
                {i + 1}. {step}
              </li>
            )
          )}
        </ol>

        <section className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">MSP Program</label>
            <select
              value={mspProgramId}
              onChange={(e) => setMspProgramId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
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

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
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
            <p className="text-gray-700 mb-2">
              Upload screenshots from your MSP portal or spreadsheets containing requisition data.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              You may upload overlapping screenshots. Duplicate requisitions will be consolidated
              by Requisition ID.
            </p>
            <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm font-medium">
              Choose Files
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </label>
            <p className="text-xs text-gray-400 mt-3">
              Supports PNG, JPG, WEBP, XLSX, XLS, and CSV
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <ul className="divide-y border rounded-md">
              {selectedFiles.map((item, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {item.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview} alt="" className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-xs">
                      DOC
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.file.name}</p>
                    <p className="text-gray-500">
                      {(item.file.size / 1024).toFixed(1)} KB
                      {item.error && (
                        <span className="text-red-600 ml-2">{item.error}</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={completeList}
              onChange={(e) => setCompleteList(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>This upload represents the complete current requisition list</strong>
              <br />
              <span className="text-gray-500">
                Enable this only when the uploaded files contain the complete current portal list.
                Missing requisitions may then be marked as No Longer Visible.
              </span>
            </span>
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting Import…" : "Start Import"}
          </button>
        </section>
      </main>
    </div>
  );
}
