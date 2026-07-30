import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listRequisitionsWithAnalysis } from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

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

    if (format === "csv") {
      // Generate CSV
      const headers = [
        "Rank",
        "Opportunity Score",
        "Recommendation",
        "Status",
        "Requisition ID",
        "Customer",
        "Job Title",
        "Location",
        "Work Arrangement",
        "Duration",
        "Position Count",
        "Submission Count",
        "Active Submissions",
        "Displayed C2C Bill Rate",
        "Effective Vendor Rate",
        "Recommended W-2 Pay Minimum",
        "Recommended W-2 Pay Maximum",
        "Midpoint Pay Rate",
        "Selected Pay Rate",
        "Estimated W-2 Cost Per Hour",
        "Gross Spread Per Hour",
        "Estimated Profit Per Hour",
        "Net Margin",
        "Estimated Weekly Profit",
        "Estimated Assignment Profit",
        "Competition Score",
        "Profitability Score",
        "Fillability Score",
        "Bill-Rate Score",
        "Duration Score",
        "Fillability Label",
        "Source Confidence",
        "Data Quality Notes",
        "First Seen",
        "Last Seen",
        "Is New",
        "No Longer Visible",
        "Requires Manual Review",
      ];

      const csvRows = exportRows.map((r) => {
        const req = r.requisition;
        const analysis = r.analysis;
        const dataQualityNotes = Array.isArray(req.dataQualityNotes)
          ? req.dataQualityNotes.map((note) => String(note))
          : [];

        return [
          analysis?.rank || "",
          analysis?.opportunityScore || "",
          analysis?.finalRecommendation || "",
          req.status || "",
          req.requisitionId || "",
          req.normalizedCustomerName || req.sourceCustomerName || "",
          req.jobTitle || "",
          req.location || "",
          req.remoteOrOnsite || "",
          req.sourceDuration || "",
          req.numberOfPositions || "",
          req.submissionCount || "",
          req.activeSubmissionCount || "",
          req.displayedVendorRate || "",
          analysis?.effectiveVendorRate || "",
          analysis?.recommendedPayMin || "",
          analysis?.recommendedPayMax || "",
          analysis?.payMidpoint || "",
          analysis?.selectedPayRate || "",
          analysis?.estimatedW2Cost || "",
          analysis?.grossSpreadPerHour || "",
          analysis?.estimatedProfitPerHour || "",
          analysis?.netMarginPercent ? `${analysis.netMarginPercent}%` : "",
          analysis?.weeklyProfit || "",
          analysis?.assignmentProfit || "",
          analysis?.competitionScore || "",
          analysis?.profitabilityScore || "",
          analysis?.fillabilityScore || "",
          analysis?.billRateScore || "",
          analysis?.durationScore || "",
          analysis?.fillabilityLabel || "",
          req.sourceConfidence || "",
          dataQualityNotes.join("; "),
          req.firstSeenAt ? new Date(req.firstSeenAt).toISOString() : "",
          req.lastSeenAt ? new Date(req.lastSeenAt).toISOString() : "",
          req.isNewToday ? "Yes" : "No",
          req.isNoLongerVisible ? "Yes" : "No",
          analysis?.requiresManualReview ? "Yes" : "No",
        ].map((cell) => {
          // Escape CSV values
          const str = String(cell).replace(/"/g, '""');
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str}"`;
          }
          return str;
        });
      });

      const csv = [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="requisitions-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // Generate Excel
    const workbook = new ExcelJS.Workbook();

    // Ranked Requisitions sheet
    const rankedSheet = workbook.addWorksheet("Ranked Requisitions");
    rankedSheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Opportunity Score", key: "opportunityScore", width: 18 },
      { header: "Recommendation", key: "recommendation", width: 25 },
      { header: "Status", key: "status", width: 15 },
      { header: "Requisition ID", key: "requisitionId", width: 18 },
      { header: "Customer", key: "customer", width: 30 },
      { header: "Job Title", key: "jobTitle", width: 40 },
      { header: "Location", key: "location", width: 25 },
      { header: "Work Arrangement", key: "workArrangement", width: 18 },
      { header: "Duration", key: "duration", width: 15 },
      { header: "Position Count", key: "positionCount", width: 15 },
      { header: "Submission Count", key: "submissionCount", width: 18 },
      { header: "Active Submissions", key: "activeSubmissions", width: 18 },
      { header: "Displayed C2C Bill Rate", key: "displayedRate", width: 22 },
      { header: "Effective Vendor Rate", key: "effectiveRate", width: 22 },
      { header: "Recommended W-2 Pay Min", key: "payMin", width: 25 },
      { header: "Recommended W-2 Pay Max", key: "payMax", width: 25 },
      { header: "Midpoint Pay Rate", key: "payMidpoint", width: 20 },
      { header: "Selected Pay Rate", key: "selectedPayRate", width: 20 },
      { header: "Estimated W-2 Cost/Hour", key: "w2Cost", width: 25 },
      { header: "Gross Spread/Hour", key: "grossSpread", width: 20 },
      { header: "Estimated Profit/Hour", key: "profitPerHour", width: 22 },
      { header: "Net Margin %", key: "netMargin", width: 15 },
      { header: "Weekly Profit", key: "weeklyProfit", width: 18 },
      { header: "Assignment Profit", key: "assignmentProfit", width: 20 },
      { header: "Competition Score", key: "competitionScore", width: 18 },
      { header: "Profitability Score", key: "profitabilityScore", width: 20 },
      { header: "Fillability Score", key: "fillabilityScore", width: 18 },
      { header: "Bill-Rate Score", key: "billRateScore", width: 18 },
      { header: "Duration Score", key: "durationScore", width: 18 },
      { header: "Fillability", key: "fillabilityLabel", width: 15 },
      { header: "Source Confidence", key: "sourceConfidence", width: 18 },
      { header: "First Seen", key: "firstSeen", width: 20 },
      { header: "Last Seen", key: "lastSeen", width: 20 },
      { header: "Is New", key: "isNew", width: 10 },
      { header: "No Longer Visible", key: "noLongerVisible", width: 18 },
      { header: "Requires Manual Review", key: "requiresReview", width: 22 },
    ];

    // Freeze header row
    rankedSheet.views = [{ state: "frozen", ySplit: 1 }];

    // Add data
    for (const r of exportRows) {
      const req = r.requisition;
      const analysis = r.analysis;

      rankedSheet.addRow({
        rank: analysis?.rank || "",
        opportunityScore: analysis?.opportunityScore || "",
        recommendation: analysis?.finalRecommendation || "",
        status: req.status || "",
        requisitionId: req.requisitionId || "",
        customer: req.normalizedCustomerName || req.sourceCustomerName || "",
        jobTitle: req.jobTitle || "",
        location: req.location || "",
        workArrangement: req.remoteOrOnsite || "",
        duration: req.sourceDuration || "",
        positionCount: req.numberOfPositions || "",
        submissionCount: req.submissionCount || "",
        activeSubmissions: req.activeSubmissionCount || "",
        displayedRate: req.displayedVendorRate ? `$${req.displayedVendorRate}` : "",
        effectiveRate: analysis?.effectiveVendorRate ? `$${analysis.effectiveVendorRate}` : "",
        payMin: analysis?.recommendedPayMin ? `$${analysis.recommendedPayMin}` : "",
        payMax: analysis?.recommendedPayMax ? `$${analysis.recommendedPayMax}` : "",
        payMidpoint: analysis?.payMidpoint ? `$${analysis.payMidpoint}` : "",
        selectedPayRate: analysis?.selectedPayRate ? `$${analysis.selectedPayRate}` : "",
        w2Cost: analysis?.estimatedW2Cost ? `$${analysis.estimatedW2Cost}` : "",
        grossSpread: analysis?.grossSpreadPerHour ? `$${analysis.grossSpreadPerHour}` : "",
        profitPerHour: analysis?.estimatedProfitPerHour ? `$${analysis.estimatedProfitPerHour}` : "",
        netMargin: analysis?.netMarginPercent ? `${analysis.netMarginPercent}%` : "",
        weeklyProfit: analysis?.weeklyProfit ? `$${analysis.weeklyProfit}` : "",
        assignmentProfit: analysis?.assignmentProfit ? `$${analysis.assignmentProfit}` : "",
        competitionScore: analysis?.competitionScore || "",
        profitabilityScore: analysis?.profitabilityScore || "",
        fillabilityScore: analysis?.fillabilityScore || "",
        billRateScore: analysis?.billRateScore || "",
        durationScore: analysis?.durationScore || "",
        fillabilityLabel: analysis?.fillabilityLabel || "",
        sourceConfidence: req.sourceConfidence || "",
        firstSeen: req.firstSeenAt ? new Date(req.firstSeenAt).toLocaleDateString() : "",
        lastSeen: req.lastSeenAt ? new Date(req.lastSeenAt).toLocaleDateString() : "",
        isNew: req.isNewToday ? "Yes" : "No",
        noLongerVisible: req.isNoLongerVisible ? "Yes" : "No",
        requiresReview: analysis?.requiresManualReview ? "Yes" : "No",
      });
    }

    // Style header row
    rankedSheet.getRow(1).font = { bold: true };
    rankedSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add filters
    rankedSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: rankedSheet.columns.length },
    };

    // Add Summary sheet
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [{ header: "Metric", key: "metric", width: 40 }, { header: "Value", key: "value", width: 20 }];

    const totalRequisitions = exportRows.length;
    const newToday = exportRows.filter((r) => r.requisition.isNewToday).length;
    const highPriority = exportRows.filter(
      (r) => r.analysis?.finalRecommendation === "Recruit Immediately" || r.analysis?.finalRecommendation === "High Priority"
    ).length;
    const negativeProfit = exportRows.filter((r) => {
      const profit = r.analysis?.estimatedProfitPerHour;
      return profit != null && parseFloat(profit) < 0;
    }).length;

    summarySheet.addRow({ metric: "Total Requisitions", value: totalRequisitions });
    summarySheet.addRow({ metric: "New Today", value: newToday });
    summarySheet.addRow({ metric: "High Priority", value: highPriority });
    summarySheet.addRow({ metric: "Negative Profit", value: negativeProfit });

    summarySheet.getRow(1).font = { bold: true };

    // Generate buffer
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
