"use client";

import {
  TrendingUpIcon,
  TargetIcon,
  UsersIcon,
  DollarSignIcon,
} from "@/components/ui/icons";

interface QuickInsightsProps {
  topOpportunity?: {
    jobTitle: string;
    requisitionId: string;
    opportunityScore: number;
    recommendation: string;
    estimatedProfitPerHour: number;
  } | null;
  portfolioStats?: {
    estimatedWeeklyProfit: number;
    negativeProfitCount: number;
    averageNetMargin: number;
  } | null;
  competitionStats?: {
    lowCompetitionCount: number;
    highCompetitionCount: number;
    averageSubmissions: number;
  } | null;
  isLoading?: boolean;
}

export function QuickInsights({
  topOpportunity,
  portfolioStats,
  competitionStats,
  isLoading,
}: QuickInsightsProps) {
  const hasData = topOpportunity || portfolioStats || competitionStats;

  if (!hasData && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm animate-pulse">
            <div className="h-4 w-24 bg-slate-200 rounded mb-3" />
            <div className="h-8 w-32 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Top Opportunity */}
      {topOpportunity && (
        <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TargetIcon className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-900">Top Opportunity</h3>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-slate-900 truncate" title={topOpportunity.jobTitle}>
              {topOpportunity.jobTitle}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Req ID:</span>
              <span className="font-mono text-slate-700">{topOpportunity.requisitionId}</span>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <div>
                <span className="text-2xl font-bold text-emerald-600 tabular-nums">
                  {topOpportunity.opportunityScore}
                </span>
                <span className="text-xs text-slate-500 block">Score</span>
              </div>
              <div className="h-8 w-px bg-emerald-200" />
              <div>
                <span className="text-lg font-semibold text-slate-900 tabular-nums">
                  ${topOpportunity.estimatedProfitPerHour.toFixed(2)}
                </span>
                <span className="text-xs text-slate-500 block">Profit/Hr</span>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
              {topOpportunity.recommendation}
            </span>
          </div>
        </div>
      )}

      {/* Portfolio Profitability */}
      {portfolioStats && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <DollarSignIcon className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-900">Portfolio</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                ${portfolioStats.estimatedWeeklyProfit.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Est. Weekly Profit</p>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
              <div>
                <span className={`text-lg font-semibold tabular-nums ${portfolioStats.negativeProfitCount > 0 ? "text-red-600" : "text-slate-900"}`}>
                  {portfolioStats.negativeProfitCount}
                </span>
                <span className="text-xs text-slate-500 block">Negative Profit</span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <span className="text-lg font-semibold text-slate-900 tabular-nums">
                  {portfolioStats.averageNetMargin.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500 block">Avg Margin</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Competition Snapshot */}
      {competitionStats && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <UsersIcon className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-slate-900">Competition</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold text-emerald-600 tabular-nums">
                  {competitionStats.lowCompetitionCount}
                </span>
                <span className="text-xs text-slate-500 block">Low Competition</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-semibold text-amber-600 tabular-nums">
                  {competitionStats.highCompetitionCount}
                </span>
                <span className="text-xs text-slate-500 block">High Competition</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Avg Submissions</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {competitionStats.averageSubmissions.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
