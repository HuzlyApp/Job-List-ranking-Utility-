"use client";

import { CheckIcon, AlertTriangleIcon, HelpCircleIcon } from "@/components/ui/icons";

interface ColumnMapping {
  sourceLabel: string;
  field: string;
  targetLabel: string;
  columnIndex: number;
  confidence: "high" | "medium" | "low";
  sampleValue?: string;
}

interface ColumnPreviewProps {
  mappings: ColumnMapping[];
  rowCount: number;
  unusedColumns?: number;
  encoding?: string;
  isRandstad?: boolean;
}

export function ColumnMappingTable({
  mappings,
  rowCount,
  unusedColumns,
  encoding,
  isRandstad,
}: ColumnPreviewProps) {
  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "high":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full">
            <CheckIcon className="w-3 h-3" />
            High
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
            <HelpCircleIcon className="w-3 h-3" />
            Medium
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded-full">
            <AlertTriangleIcon className="w-3 h-3" />
            Needs Review
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Column Mapping</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-slate-700">
              {rowCount.toLocaleString()} rows detected
            </span>
            {unusedColumns !== undefined && unusedColumns > 0 && (
              <span className="font-medium text-slate-500">
                {unusedColumns} unused column{unusedColumns !== 1 ? "s" : ""} ignored
              </span>
            )}
            {encoding && (
              <span className="font-medium text-slate-500">
                Encoding: {encoding}
              </span>
            )}
          </div>
        </div>
        {isRandstad && (
          <p className="mt-2 text-sm font-bold text-emerald-700 flex items-center gap-2">
            <CheckIcon className="w-4 h-4" />
            Recognized as Randstad requisition export
          </p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-300">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Source Column
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sample Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Maps To
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {mappings.map((mapping) => (
              <tr key={mapping.field} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-slate-900">
                    {mapping.sourceLabel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[200px] block">
                    {mapping.sampleValue || "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-emerald-700">
                    {mapping.targetLabel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {getConfidenceBadge(mapping.confidence)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
