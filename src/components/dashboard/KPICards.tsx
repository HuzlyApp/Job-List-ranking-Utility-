"use client";

interface RequisitionWithAnalysis {
  requisition: {
    id: string;
    isNewToday: boolean;
    isNoLongerVisible: boolean;
  };
  analysis: {
    finalRecommendation: string | null;
    estimatedProfitPerHour: string | null;
    opportunityScore: number | null;
  } | null;
}

interface KPICardsProps {
  requisitions: RequisitionWithAnalysis[];
}

export function KPICards({ requisitions }: KPICardsProps) {
  const totalRequisitions = requisitions.length;
  const newToday = requisitions.filter((r) => r.requisition.isNewToday).length;
  const highPriority = requisitions.filter(
    (r) =>
      r.analysis?.finalRecommendation === "Recruit Immediately" ||
      r.analysis?.finalRecommendation === "High Priority"
  ).length;
  const negativeProfit = requisitions.filter((r) => {
    if (r.analysis?.estimatedProfitPerHour == null) return false;
    const profit = parseFloat(r.analysis.estimatedProfitPerHour);
    return Number.isFinite(profit) && profit < 0;
  }).length;
  const noLongerVisible = requisitions.filter(
    (r) => r.requisition.isNoLongerVisible
  ).length;
  const avgScore =
    requisitions.length > 0
      ? Math.round(
          requisitions.reduce((sum, r) => sum + (r.analysis?.opportunityScore || 0), 0) /
            requisitions.length
        )
      : 0;

  const cards = [
    {
      title: "Total Requisitions",
      value: totalRequisitions.toLocaleString(),
      color: "bg-blue-500",
    },
    {
      title: "New Today",
      value: newToday.toLocaleString(),
      color: "bg-green-500",
    },
    {
      title: "High Priority",
      value: highPriority.toLocaleString(),
      color: "bg-emerald-500",
    },
    {
      title: "Negative Profit",
      value: negativeProfit.toLocaleString(),
      color: "bg-red-500",
    },
    {
      title: "No Longer Visible",
      value: noLongerVisible.toLocaleString(),
      color: "bg-gray-500",
    },
    {
      title: "Avg Opportunity Score",
      value: avgScore.toString(),
      color: "bg-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
        >
          <div className="flex items-center">
            <div className={`${card.color} h-10 w-10 rounded-full flex items-center justify-center`}>
              <span className="text-white text-lg font-bold">
                {card.title.charAt(0)}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">{card.title}</p>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
