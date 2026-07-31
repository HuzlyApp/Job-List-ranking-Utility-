"use client";

import { useState } from "react";
import { SearchIcon, FilterIcon } from "@/components/ui/icons";
import {
  DUPLICATE_STATUSES,
  duplicateStatusBadgeClass,
  type DuplicateStatus,
} from "@/lib/duplicate-check-core";
import { formatPayRange } from "@/lib/pay-range";

export type ReviewFilter = "all" | "valid" | "needs_review" | "missing_id" | "missing_rate" | "duplicate" | "excluded";

interface ReviewRow {
  id: string;
  excluded: boolean;
  sourceFilename: string;
  sheetName: string | null;
  rowNumber: number | null;
  sourceConfidence: string;
  dataQualityNotes: string[];
  duplicateStatus?: string;
  duplicateMatchReason?: string | null;
  existingRecord?: Record<string, unknown> | null;
  data: {
    requisition_id: string | null;
    status: string | null;
    customer: string | null;
    job_title: string | null;
    submissions: number | null;
    c2c_bill_rate: number | null;
    c2c_bill_rate_normalized?: string | null;
    location: string | null;
    duration: string | null;
    position_type: string | null;
    recommended_w2_pay_min?: string | number | null;
    recommended_w2_pay_max?: string | number | null;
  };
}

interface ReviewTableProps {
  rows: ReviewRow[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
}

const filters: { id: ReviewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "valid", label: "Valid" },
  { id: "needs_review", label: "Needs Review" },
  { id: "missing_id", label: "Missing ID" },
  { id: "missing_rate", label: "Missing Rate" },
  { id: "duplicate", label: "Duplicate" },
  { id: "excluded", label: "Excluded" },
];

export function ReviewTable({ rows, onUpdate, selectedRowId, onSelectRow }: ReviewTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>("all");

  const filteredRows = rows.filter((row) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchable = [
        row.data.requisition_id,
        row.data.customer,
        row.data.job_title,
        row.data.location,
      ].join(" ").toLowerCase();
      if (!searchable.includes(query)) return false;
    }

    // Category filter
    switch (activeFilter) {
      case "valid":
        return !row.excluded && row.data.requisition_id && row.data.c2c_bill_rate;
      case "needs_review":
        return !row.excluded && (!row.data.requisition_id || !row.data.c2c_bill_rate);
      case "missing_id":
        return !row.excluded && !row.data.requisition_id;
      case "missing_rate":
        return !row.excluded && !row.data.c2c_bill_rate;
      case "duplicate":
        return /(duplicate|already|conflict|possible)/i.test(row.duplicateStatus || "");
      case "excluded":
        return row.excluded;
      default:
        return true;
    }
  });

  const getDuplicateStatus = (row: ReviewRow): DuplicateStatus => {
    const status = row.duplicateStatus;
    return DUPLICATE_STATUSES.includes(status as DuplicateStatus)
      ? (status as DuplicateStatus)
      : "New";
  };

  const getIssueBadges = (row: ReviewRow) => {
    const badges = [];
    if (!row.data.requisition_id) {
      badges.push(
        <span key="missing-id" className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">
          Missing ID
        </span>
      );
    }
    if (!row.data.c2c_bill_rate) {
      badges.push(
        <span key="missing-rate" className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">
          Missing Rate
        </span>
      );
    }
    if (row.sourceConfidence === "Low") {
      badges.push(
        <span key="low-conf" className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded">
          Low Confidence
        </span>
      );
    }
    return badges;
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-3">
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterIcon className="w-4 h-4 text-slate-500" />
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors
                ${activeFilter === filter.id
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-300 sticky top-0">
            <tr>
              <th className="w-10 px-3 py-3">
                <span className="sr-only">Include</span>
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Duplicate Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Confidence
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
                Bill Rate
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recommended Pay Range
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Submissions
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Location
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Issues
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className={`cursor-pointer transition-colors
                  ${row.excluded ? "opacity-50" : ""}
                  ${selectedRowId === row.id ? "bg-emerald-50" : "hover:bg-slate-50"}
                `}
                onClick={() => onSelectRow?.(row.id)}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={!row.excluded}
                    onChange={(e) => onUpdate(row.id, { excluded: !e.target.checked })}
                    className="w-4 h-4 text-emerald-600 border-slate-400 rounded focus:ring-emerald-500"
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    title={row.duplicateMatchReason || undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRow?.(row.id);
                    }}
                    className={`inline-flex items-center whitespace-nowrap px-2 py-1 text-xs font-bold rounded-full border ${duplicateStatusBadgeClass(getDuplicateStatus(row))}`}
                  >
                    {getDuplicateStatus(row)}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.sourceConfidence || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <input
                    className="w-24 px-2 py-1 text-sm font-mono font-medium text-slate-800 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    value={row.data.requisition_id || ""}
                    onChange={(e) => onUpdate(row.id, { requisition_id: e.target.value || null })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Req ID"
                  />
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.data.customer || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[150px] block">
                    {row.data.job_title || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <input
                    className="w-24 px-2 py-1 text-sm font-bold text-slate-800 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    value={row.data.c2c_bill_rate_normalized || (row.data.c2c_bill_rate != null ? String(row.data.c2c_bill_rate) : "")}
                    onChange={(e) =>
                      onUpdate(row.id, {
                        c2c_bill_rate: e.target.value ? parseFloat(e.target.value) : null,
                        c2c_bill_rate_normalized: e.target.value || null,
                      })
                    }
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Rate"
                  />
                </td>
                <td className="px-3 py-3">
                  <span className="whitespace-nowrap text-sm font-bold text-emerald-700 tabular-nums">
                    {row.data.recommended_w2_pay_min == null ||
                    row.data.recommended_w2_pay_max == null
                      ? formatPayRange(null, null, "pending")
                      : formatPayRange(
                          row.data.recommended_w2_pay_min,
                          row.data.recommended_w2_pay_max
                        )}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {row.data.submissions ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {row.data.location || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="whitespace-nowrap text-sm font-medium text-slate-700">
                    {row.data.duration || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {getIssueBadges(row)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRow?.(selectedRowId === row.id ? null : row.id);
                    }}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                  >
                    {selectedRowId === row.id ? "Selected" : "Compare"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <p className="text-sm font-bold text-slate-700">
          Showing {filteredRows.length} of {rows.length} records
        </p>
      </div>
    </div>
  );
}
