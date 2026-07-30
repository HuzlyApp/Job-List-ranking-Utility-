import { NextResponse } from "next/server";

const TEMPLATE_COLUMNS = [
  "Status",
  "Requisition ID",
  "Customer",
  "Job Title",
  "Submissions",
  "C2C Rate",
  "Location",
  "Start Date",
  "Duration",
  "Positions",
  "Active",
  "Released",
  "Type",
];

const SAMPLE_ROWS = [
  [
    "Open",
    "161867",
    "LTI Mindtree",
    "Senior Java Developer",
    "0",
    "$85.00",
    "Remote, US",
    "2026-08-15",
    "6 months",
    "1",
    "0",
    "2026-07-28",
    "C2C",
  ],
  [
    "Open",
    "161863",
    "Tesla",
    "Embedded Software Engineer",
    "2",
    "$95.50",
    "Palo Alto, CA",
    "2026-09-01",
    "12 months",
    "2",
    "1",
    "2026-07-25",
    "C2C",
  ],
  [
    "Open",
    "161871",
    "Deloitte",
    "Data Analyst",
    "5",
    "$72.00",
    "Dallas, TX (Hybrid)",
    "2026-08-30",
    "4 months",
    "1",
    "3",
    "2026-07-29",
    "C2C",
  ],
  [
    "Open",
    "161874",
    "Amazon Web Services",
    "Cloud Solutions Architect",
    "1",
    "$120.00",
    "Seattle, WA (Remote)",
    "2026-08-20",
    "Contract to Hire",
    "1",
    "0",
    "2026-07-30",
    "C2C",
  ],
  [
    "Open",
    "161879",
    "JPMorgan Chase",
    "Business Analyst - Risk",
    "8",
    "$78.50",
    "New York, NY (Onsite)",
    "2026-09-15",
    "8 months",
    "3",
    "5",
    "2026-07-31",
    "C2C",
  ],
];

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const headerRow = TEMPLATE_COLUMNS.map(escapeCsvField).join(",");
  const dataRows = SAMPLE_ROWS.map((row) =>
    row.map(escapeCsvField).join(",")
  );

  const csv = [headerRow, ...dataRows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="requisition-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
