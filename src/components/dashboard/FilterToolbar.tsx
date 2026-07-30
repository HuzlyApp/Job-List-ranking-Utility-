"use client";

import { useState } from "react";
import {
  SearchIcon,
  FilterIcon,
  XIcon,
} from "@/components/ui/icons";

export interface FilterState {
  search: string;
  status: string;
  recommendation: string;
  minScore: string;
  maxScore: string;
  customer: string;
  isNewToday: boolean;
  isNoLongerVisible: boolean;
  negativeProfit: boolean;
  highPriority: boolean;
}

interface FilterToolbarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  customers: string[];
}

const recommendations = [
  { value: "", label: "All Recommendations" },
  { value: "Recruit Immediately", label: "Recruit Immediately" },
  { value: "High Priority", label: "High Priority" },
  { value: "Good Opportunity", label: "Good Opportunity" },
  { value: "Candidate Driven", label: "Candidate Driven" },
  { value: "Only If Candidate Available", label: "Only If Candidate Available" },
  { value: "Skip or Monitor", label: "Skip or Monitor" },
];

const statuses = [
  { value: "", label: "All Statuses" },
  { value: "Open", label: "Open" },
  { value: "Closed", label: "Closed" },
  { value: "Filled", label: "Filled" },
  { value: "On Hold", label: "On Hold" },
];

export function FilterToolbar({ filters, onChange, customers }: FilterToolbarProps) {
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const activeFilterCount = [
    filters.status,
    filters.recommendation,
    filters.minScore,
    filters.maxScore,
    filters.customer,
    filters.isNewToday,
    filters.isNoLongerVisible,
    filters.negativeProfit,
    filters.highPriority,
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    onChange({
      search: "",
      status: "",
      recommendation: "",
      minScore: "",
      maxScore: "",
      customer: "",
      isNewToday: false,
      isNoLongerVisible: false,
      negativeProfit: false,
      highPriority: false,
    });
  };

  const hasActiveFilters = activeFilterCount > 0 || filters.search;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      {/* Main Toolbar */}
      <div className="p-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search requisitions..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
          />
        </div>

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          className="px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
        >
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Recommendation Filter */}
        <select
          value={filters.recommendation}
          onChange={(e) => onChange({ ...filters, recommendation: e.target.value })}
          className="px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
        >
          {recommendations.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {/* More Filters Toggle */}
        <button
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
            ${showMoreFilters 
              ? "bg-emerald-50 border-emerald-300 text-emerald-800" 
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }
          `}
        >
          <FilterIcon className="w-4 h-4" />
          <span>More Filters</span>
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <XIcon className="w-4 h-4" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showMoreFilters && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Score Range */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Score:</span>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Min"
                value={filters.minScore}
                onChange={(e) => onChange({ ...filters, minScore: e.target.value })}
                className="w-20 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              <span className="text-slate-600 font-medium">-</span>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Max"
                value={filters.maxScore}
                onChange={(e) => onChange({ ...filters, maxScore: e.target.value })}
                className="w-20 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Customer Filter */}
            {customers.length > 0 && (
              <select
                value={filters.customer}
                onChange={(e) => onChange({ ...filters, customer: e.target.value })}
                className="px-3 py-1.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
              >
                <option value="">All Customers</option>
                {customers.map((customer) => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            )}

            {/* New Today Toggle */}
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 rounded-lg">
              <input
                type="checkbox"
                checked={filters.isNewToday}
                onChange={(e) => onChange({ ...filters, isNewToday: e.target.checked })}
                className="w-4 h-4 text-emerald-600 border-slate-400 rounded focus:ring-emerald-500"
              />
              <span className="text-slate-800 font-medium">New Today Only</span>
            </label>
          </div>
        </div>
      )}

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
          {filters.search && (
            <FilterChip
              label={`Search: "${filters.search}"`}
              onRemove={() => onChange({ ...filters, search: "" })}
            />
          )}
          {filters.status && (
            <FilterChip
              label={`Status: ${filters.status}`}
              onRemove={() => onChange({ ...filters, status: "" })}
            />
          )}
          {filters.recommendation && (
            <FilterChip
              label={`Rec: ${filters.recommendation}`}
              onRemove={() => onChange({ ...filters, recommendation: "" })}
            />
          )}
          {(filters.minScore || filters.maxScore) && (
            <FilterChip
              label={`Score: ${filters.minScore || "0"}-${filters.maxScore || "100"}`}
              onRemove={() => onChange({ ...filters, minScore: "", maxScore: "" })}
            />
          )}
          {filters.customer && (
            <FilterChip
              label={`Customer: ${filters.customer}`}
              onRemove={() => onChange({ ...filters, customer: "" })}
            />
          )}
          {filters.isNewToday && (
            <FilterChip
              label="New Today"
              onRemove={() => onChange({ ...filters, isNewToday: false })}
            />
          )}
          {filters.highPriority && (
            <FilterChip
              label="High Priority"
              onRemove={() => onChange({ ...filters, highPriority: false })}
            />
          )}
          {filters.negativeProfit && (
            <FilterChip
              label="Negative Profit"
              onRemove={() => onChange({ ...filters, negativeProfit: false })}
            />
          )}
          {filters.isNoLongerVisible && (
            <FilterChip
              label="No Longer Visible"
              onRemove={() => onChange({ ...filters, isNoLongerVisible: false })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
      {label}
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 hover:bg-emerald-100 rounded-full transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
