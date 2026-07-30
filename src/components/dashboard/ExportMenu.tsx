"use client";

import { useState } from "react";
import {
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";

interface ExportMenuProps {
  onExport: (format: "csv" | "xlsx") => void;
  disabled?: boolean;
  disabledTooltip?: string;
}

export function ExportMenu({ onExport, disabled, disabledTooltip }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = (format: "csv" | "xlsx") => {
    onExport(format);
    setIsOpen(false);
  };

  if (disabled) {
    return (
      <div className="relative group">
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-400 bg-slate-100 border border-slate-300 rounded-lg cursor-not-allowed"
        >
          <DownloadIcon className="w-4 h-4" />
          <span>Export</span>
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        {disabledTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-bold text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {disabledTooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-colors"
      >
        <DownloadIcon className="w-4 h-4" />
        <span>Export</span>
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-300 rounded-lg shadow-lg z-50 py-1">
            <button
              onClick={() => handleExport("csv")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <FileTextIcon className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <FileSpreadsheetIcon className="w-4 h-4 text-emerald-600" />
              <span>Export Excel</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
