"use client";

interface PreviewRow {
  id: string;
  status: string | null;
  requisitionId: string | null;
  customer: string | null;
  jobTitle: string | null;
  submissions: number | null;
  billRate: string | null;
  location: string | null;
  duration: string | null;
  releasedDate: string | null;
}

interface DataPreviewTableProps {
  rows: PreviewRow[];
}

export function DataPreviewTable({ rows }: DataPreviewTableProps) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-300 rounded-xl p-8 text-center">
        <p className="text-slate-500 font-medium">No preview data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-bold text-slate-900">Data Preview</h3>
        <p className="text-sm font-medium text-slate-600 mt-1">
          First {rows.length} records. Review the detected fields before continuing.
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-300">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Req ID
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Job Title
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sub
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bill Rate
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Location
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.status || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-mono font-medium text-slate-800">
                    {row.requisitionId || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.customer || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[150px] block">
                    {row.jobTitle || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {row.submissions ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {row.billRate || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.location || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.duration || "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
