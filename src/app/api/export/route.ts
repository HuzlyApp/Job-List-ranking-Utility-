import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listRequisitionsWithAnalysis } from "@/lib/dashboard-queries";
import { formatPayRange } from "@/lib/pay-range";

export const dynamic = "force-dynamic";

const RANKED_COLUMNS = [
  "Rank",
  "Opportunity Score",
  "Status",
  "Requisition ID",
  "Start Date",
  "Customer",
  "Job Title",
  "Location",
  "Duration",
  "Submission Count",
  "C2C Bill Rate",
  "Effective Vendor Rate After 2%",
  "Recommended W-2 Pay Range",
  "Market Pay Floor",
  "Market Pay Confidence",
  "Pay Recommendation Reason",
  "Bill Rate Supports Market Pay",
  "Midpoint Pay Rate",
  "Estimated W-2 Cost Per Hour",
  "Gross Spread Per Hour",
  "Estimated Profit Per Hour",
  "Net Margin %",
  "Estimated Weekly Profit",
  "Estimated Assignment Profit",
  "Fillability",
  "Recommendation",
  "Data Quality Notes",
  "Position Type",
] as const;

function money(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Not available";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return "Not available";
  return `$${n.toFixed(2)}`;
}

function pct(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Not available";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return "Not available";
  return `${n.toFixed(2)}%`;
}

function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return value ? "Yes" : "No";
}

function displayOrNa(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Not available";
  return String(value);
}

function buildRankedRow(r: Awaited<ReturnType<typeof listRequisitionsWithAnalysis>>["requisitions"][number]) {
  const req = r.requisition;
  const analysis = r.analysis;
  const dataQualityNotes = Array.isArray(req.dataQualityNotes)
    ? req.dataQualityNotes.map((note) => String(note))
    : [];

  return {
    rank: analysis?.rank ?? "",
    opportunityScore: analysis?.opportunityScore ?? "",
    status: displayOrNa(req.status),
    requisitionId: displayOrNa(req.requisitionId),
    startDate: req.startDate ? new Date(req.startDate).toLocaleDateString() : "Not available",
    customer: displayOrNa(req.normalizedCustomerName || req.sourceCustomerName),
    jobTitle: displayOrNa(req.jobTitle),
    location: displayOrNa(req.location),
    duration: displayOrNa(req.sourceDuration),
    submissionCount: req.submissionCount ?? "Not available",
    c2cBillRate: money(req.displayedVendorRate),
    effectiveVendorRate: money(analysis?.effectiveVendorRate),
    recommendedPayRange: formatPayRange(analysis?.recommendedPayMin, analysis?.recommendedPayMax),
    marketPayFloor: money(analysis?.marketPayFloor),
    marketPayConfidence: displayOrNa(analysis?.payRangeConfidence ?? null),
    payRecommendationReason: displayOrNa(analysis?.payEstimateReason),
    billRateSupportsMarketPay: yesNo(analysis?.billRateSupportsMarketPay),
    midpointPayRate: money(analysis?.payMidpoint),
    estimatedW2Cost: money(analysis?.estimatedW2Cost),
    grossSpread: money(analysis?.grossSpreadPerHour),
    profitPerHour: money(analysis?.estimatedProfitPerHour),
    netMargin: pct(analysis?.netMarginPercent),
    weeklyProfit: money(analysis?.weeklyProfit),
    assignmentProfit: money(analysis?.assignmentProfit),
    fillability: displayOrNa(analysis?.fillabilityLabel),
    recommendation: displayOrNa(analysis?.finalRecommendation),
    dataQualityNotes: dataQualityNotes.length ? dataQualityNotes.join("; ") : "Not available",
    positionType: displayOrNa(req.positionType),
  };
}

// GET /api/export - Export requisitions to Excel or CSV
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const mspProgramId = searchParams.get("mspProgramId") || undefined;
    const format = searchParams.get("format") || "xlsx";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const { requisitions: exportRows, pagination } = await listRequisitionsWithAnalysis({
      tenantId,
      mspProgramId,
      page: 1,
      limit: 500,
      sortBy: "opportunityScore",
      sortOrder: "desc",
    });

    console.info("[export.fetch]", {
      tenant_id: tenantId,
      requisition_count: exportRows.length,
      total: pagination.total,
      format,
    });

    const rankedData = exportRows.map(buildRankedRow);

    if (format === "csv") {
      const csvRows = rankedData.map((row) =>
        [
          row.rank,
          row.opportunityScore,
          row.status,
          row.requisitionId,
          row.startDate,
          row.customer,
          row.jobTitle,
          row.location,
          row.duration,
          row.submissionCount,
          row.c2cBillRate,
          row.effectiveVendorRate,
          row.recommendedPayRange,
          row.marketPayFloor,
          row.marketPayConfidence,
          row.payRecommendationReason,
          row.billRateSupportsMarketPay,
          row.midpointPayRate,
          row.estimatedW2Cost,
          row.grossSpread,
          row.profitPerHour,
          row.netMargin,
          row.weeklyProfit,
          row.assignmentProfit,
          row.fillability,
          row.recommendation,
          row.dataQualityNotes,
          row.positionType,
        ].map((cell) => {
          const str = String(cell).replace(/"/g, '""');
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str}"`;
          }
          return str;
        })
      );

      const csv = [RANKED_COLUMNS.join(","), ...csvRows.map((row) => row.join(","))].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="requisitions-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Job List Ranking Utility";
    workbook.created = new Date();

    // --- Processing Summary ---
    const summarySheet = workbook.addWorksheet("Processing Summary");
    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 40 },
      { header: "Value", key: "value", width: 20 },
    ];
    const highPriority = exportRows.filter(
      (r) =>
        r.analysis?.finalRecommendation === "Recruit Immediately" ||
        r.analysis?.finalRecommendation === "High Priority"
    ).length;
    const negativeProfit = exportRows.filter((r) => {
      const profit = r.analysis?.estimatedProfitPerHour;
      return profit != null && parseFloat(profit) < 0;
    }).length;
    const uncertain = exportRows.filter(
      (r) =>
        r.requisition.sourceConfidence === "Low" ||
        r.analysis?.requiresManualReview
    ).length;

    summarySheet.addRow({ metric: "Unique requisitions", value: exportRows.length });
    summarySheet.addRow({ metric: "High-priority requisitions", value: highPriority });
    summarySheet.addRow({ metric: "Negative-profit requisitions", value: negativeProfit });
    summarySheet.addRow({ metric: "Records with uncertain fields / review", value: uncertain });
    summarySheet.addRow({ metric: "New today", value: exportRows.filter((r) => r.requisition.isNewToday).length });
    summarySheet.addRow({
      metric: "No longer visible",
      value: exportRows.filter((r) => r.requisition.isNoLongerVisible).length,
    });
    summarySheet.getRow(1).font = { bold: true };

    // --- Ranked Requisitions ---
    const rankedSheet = workbook.addWorksheet("Ranked Requisitions");
    rankedSheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Opportunity Score", key: "opportunityScore", width: 18 },
      { header: "Status", key: "status", width: 15 },
      { header: "Requisition ID", key: "requisitionId", width: 18 },
      { header: "Start Date", key: "startDate", width: 14 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Job Title", key: "jobTitle", width: 40 },
      { header: "Location", key: "location", width: 25 },
      { header: "Duration", key: "duration", width: 15 },
      { header: "Submission Count", key: "submissionCount", width: 16 },
      { header: "C2C Bill Rate", key: "c2cBillRate", width: 14 },
      { header: "Effective Vendor Rate After 2%", key: "effectiveVendorRate", width: 28 },
      { header: "Recommended W-2 Pay Range", key: "recommendedPayRange", width: 26 },
      { header: "Market Pay Floor", key: "marketPayFloor", width: 16 },
      { header: "Market Pay Confidence", key: "marketPayConfidence", width: 20 },
      { header: "Pay Recommendation Reason", key: "payRecommendationReason", width: 40 },
      { header: "Bill Rate Supports Market Pay", key: "billRateSupportsMarketPay", width: 26 },
      { header: "Midpoint Pay Rate", key: "midpointPayRate", width: 16 },
      { header: "Estimated W-2 Cost Per Hour", key: "estimatedW2Cost", width: 24 },
      { header: "Gross Spread Per Hour", key: "grossSpread", width: 20 },
      { header: "Estimated Profit Per Hour", key: "profitPerHour", width: 22 },
      { header: "Net Margin %", key: "netMargin", width: 14 },
      { header: "Estimated Weekly Profit", key: "weeklyProfit", width: 20 },
      { header: "Estimated Assignment Profit", key: "assignmentProfit", width: 24 },
      { header: "Fillability", key: "fillability", width: 14 },
      { header: "Recommendation", key: "recommendation", width: 24 },
      { header: "Data Quality Notes", key: "dataQualityNotes", width: 40 },
      { header: "Position Type", key: "positionType", width: 16 },
    ];
    rankedSheet.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of rankedData) {
      rankedSheet.addRow(row);
    }
    rankedSheet.getRow(1).font = { bold: true };
    rankedSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    rankedSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: rankedSheet.columns.length },
    };

    // --- Top Requisitions to Target ---
    const topSheet = workbook.addWorksheet("Top Requisitions to Target");
    topSheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Requisition ID", key: "requisitionId", width: 18 },
      { header: "Start Date", key: "startDate", width: 14 },
      { header: "Job Title", key: "jobTitle", width: 40 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Opportunity Score", key: "opportunityScore", width: 18 },
      { header: "Estimated Profit per Hour", key: "profitPerHour", width: 24 },
      { header: "Justification", key: "justification", width: 50 },
    ];
    topSheet.views = [{ state: "frozen", ySplit: 1 }];
    const topFive = [...exportRows]
      .filter((r) => r.analysis?.rank != null)
      .sort((a, b) => (a.analysis?.rank || 999) - (b.analysis?.rank || 999))
      .slice(0, 5);
    for (const r of topFive) {
      const built = buildRankedRow(r);
      topSheet.addRow({
        rank: built.rank,
        requisitionId: built.requisitionId,
        startDate: built.startDate,
        jobTitle: built.jobTitle,
        customer: built.customer,
        opportunityScore: built.opportunityScore,
        profitPerHour: built.profitPerHour,
        justification:
          r.analysis?.payEstimateReason ||
          `${built.recommendation} — opportunity ${built.opportunityScore}, profit ${built.profitPerHour}/hr.`,
      });
    }
    topSheet.getRow(1).font = { bold: true };

    // --- Jobs to Avoid / Candidate Driven ---
    const avoidSheet = workbook.addWorksheet("Avoid or Candidate Driven");
    avoidSheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Requisition ID", key: "requisitionId", width: 18 },
      { header: "Job Title", key: "jobTitle", width: 40 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Recommendation", key: "recommendation", width: 24 },
      { header: "Profit/Hour", key: "profitPerHour", width: 14 },
      { header: "Bill Supports Market Pay", key: "billRateSupportsMarketPay", width: 24 },
      { header: "Warning", key: "warning", width: 40 },
      { header: "Reason", key: "reason", width: 40 },
    ];
    avoidSheet.views = [{ state: "frozen", ySplit: 1 }];
    const avoidRows = exportRows.filter((r) => {
      const profit = r.analysis?.estimatedProfitPerHour;
      const neg = profit != null && parseFloat(profit) < 0;
      const unsupported = r.analysis?.billRateSupportsMarketPay === false;
      const highComp = (r.requisition.submissionCount ?? 0) > 20;
      const lowRec =
        r.analysis?.finalRecommendation === "Skip or Monitor" ||
        r.analysis?.finalRecommendation === "Only If Candidate Available" ||
        r.analysis?.finalRecommendation === "Candidate Driven";
      const uncertainRec =
        r.requisition.sourceConfidence === "Low" || r.analysis?.requiresManualReview;
      return neg || unsupported || highComp || lowRec || uncertainRec;
    });
    for (const r of avoidRows) {
      const built = buildRankedRow(r);
      avoidSheet.addRow({
        rank: built.rank,
        requisitionId: built.requisitionId,
        jobTitle: built.jobTitle,
        customer: built.customer,
        recommendation: built.recommendation,
        profitPerHour: built.profitPerHour,
        billRateSupportsMarketPay: built.billRateSupportsMarketPay,
        warning: displayOrNa(r.analysis?.marketRateWarning),
        reason: built.payRecommendationReason,
      });
    }
    avoidSheet.getRow(1).font = { bold: true };

    // --- Extraction and Assumption Notes ---
    const notesSheet = workbook.addWorksheet("Extraction and Assumption Notes");
    notesSheet.columns = [{ header: "Note", key: "note", width: 100 }];
    const assumptionNotes = [
      "Duplicate handling: requisition_id is the primary key; submission counts are never summed across duplicates.",
      "Date conversion: Excel serial dates use epoch 1899-12-30 and normalize to MM/DD/YYYY when applicable.",
      "Financial assumptions: default 2% Randstad MSP deduction unless a program exception applies.",
      "W-2 costs: FICA 7.65% of midpoint + FUTA/SUTA $0.45 + WC $0.30 (or $0.60 higher-risk) + payroll $0.25 + compliance $0.20 + insurance $0.25 + recruiting $1.25 + overhead $0.75.",
      "Market-first pay: competitive W-2 pay is set before profitability; pay is not lowered to manufacture margin.",
      "Deterministic server recalculation is authoritative for rates, scores, ranks, and financial metrics.",
      "Healthcare roles without a configured WC rate are flagged for manual review.",
      "Provider: xAI Grok via OpenAI-compatible API. Screenshots require a vision-capable GROK_MODEL.",
    ];
    for (const note of assumptionNotes) {
      notesSheet.addRow({ note });
    }
    notesSheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="requisitions-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
