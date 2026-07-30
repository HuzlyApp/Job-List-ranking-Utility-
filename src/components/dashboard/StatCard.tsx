"use client";

import { ReactNode } from "react";
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "@/components/ui/icons";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  change?: {
    value: number;
    label: string;
    trend: "up" | "down" | "neutral";
  };
  accent?: "default" | "success" | "warning" | "danger" | "info";
  isLoading?: boolean;
  onClick?: () => void;
  active?: boolean;
}

const accentStyles = {
  default: {
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
  },
  success: {
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  warning: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  danger: {
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
  info: {
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
};

export function StatCard({
  title,
  value,
  icon,
  description,
  change,
  accent = "default",
  isLoading = false,
  onClick,
  active = false,
}: StatCardProps) {
  const styles = accentStyles[accent];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-sm">
        <div className="animate-pulse">
          <div className="flex items-start justify-between">
            <div className="space-y-3 flex-1">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-8 w-16 bg-slate-200 rounded" />
            </div>
            <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          </div>
          <div className="mt-4 h-4 w-32 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const className = `w-full text-left bg-white rounded-xl border p-5 shadow-sm transition-all ${
    onClick
      ? "cursor-pointer hover:shadow-md hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      : "hover:shadow-md"
  } ${
    active
      ? "border-emerald-500 ring-2 ring-emerald-100 shadow-md"
      : "border-slate-300"
  }`;

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700 truncate">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
        <div className={`flex-shrink-0 w-10 h-10 ${styles.iconBg} rounded-lg flex items-center justify-center`}>
          <span className={styles.iconColor}>{icon}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {change && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold
            ${change.trend === "up" ? "text-emerald-700" :
              change.trend === "down" ? "text-red-700" : "text-slate-600"}
          `}>
            {change.trend === "up" && <TrendingUpIcon className="w-3.5 h-3.5" />}
            {change.trend === "down" && <TrendingDownIcon className="w-3.5 h-3.5" />}
            {change.trend === "neutral" && <MinusIcon className="w-3.5 h-3.5" />}
            {change.value > 0 ? `+${change.value}` : change.value}
          </span>
        )}
        {(change?.label || description) && (
          <span className="text-xs font-medium text-slate-600 truncate">
            {change?.label || description}
          </span>
        )}
        {onClick && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {active ? "Active" : "Filter"}
          </span>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={className}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

// Skeleton loader for stat cards
export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-4 w-24 bg-slate-200 rounded" />
            <div className="h-8 w-16 bg-slate-200 rounded" />
          </div>
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
        </div>
        <div className="mt-4 h-4 w-32 bg-slate-200 rounded" />
      </div>
    </div>
  );
}
