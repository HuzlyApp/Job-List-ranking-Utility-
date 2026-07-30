export type PayRangeFit =
  | "Strong Fit"
  | "Workable"
  | "Tight"
  | "Below Market"
  | "Requires Review"
  | "Unavailable";

export type PayRangeConfidence = "High" | "Medium" | "Low";

export type PayRangeDisplayStatus =
  | "ready"
  | "pending"
  | "failed"
  | "requires_review";

export function parsePayNumber(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function calculatePayMidpoint(
  min: number | null,
  max: number | null
): number | null {
  if (min === null || max === null) return null;
  return Math.round(((min + max) / 2) * 100) / 100;
}

export function resolveTargetPayRate(options: {
  min: number | null;
  max: number | null;
  scenario?: "minimum" | "midpoint" | "maximum" | "custom";
  customRate?: number | null;
}): number | null {
  const { min, max, scenario = "midpoint", customRate } = options;
  if (scenario === "custom") return customRate ?? null;
  if (min === null || max === null) return null;
  if (scenario === "minimum") return min;
  if (scenario === "maximum") return max;
  return calculatePayMidpoint(min, max);
}

/** Format as `$52–$54/hr` from numeric min/max. */
export function formatPayRange(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
  status: PayRangeDisplayStatus = "ready"
): string {
  if (status === "pending") return "Pending Analysis";
  if (status === "failed") return "Analysis Failed";
  if (status === "requires_review") return "Requires Review";

  const lo = parsePayNumber(min);
  const hi = parsePayNumber(max);
  if (lo === null || hi === null) return "Requires Review";

  const fmt = (n: number) =>
    Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2).replace(/\.00$/, "")}`;
  return `${fmt(lo)}–${fmt(hi)}/hr`;
}

export function formatPayRate(
  value: string | number | null | undefined
): string {
  const n = parsePayNumber(value);
  if (n === null) return "—";
  return Number.isInteger(n) ? `$${n}/hr` : `$${n.toFixed(2)}/hr`;
}

/**
 * Deterministic Pay Range Fit when Claude does not provide one.
 * Uses bill-rate headroom vs midpoint of recommended pay.
 */
export function derivePayRangeFit(input: {
  billRate: number | null;
  payMin: number | null;
  payMax: number | null;
  analysisFailed?: boolean;
  missingRequired?: boolean;
}): PayRangeFit {
  if (input.analysisFailed) return "Unavailable";
  if (input.missingRequired || input.billRate === null) return "Requires Review";
  if (input.payMin === null || input.payMax === null) return "Requires Review";

  const midpoint = calculatePayMidpoint(input.payMin, input.payMax);
  if (midpoint === null || midpoint <= 0) return "Requires Review";

  // Rough employer-cost share: candidate pay often ~50–60% of bill after MSP fee.
  const ratio = midpoint / input.billRate;

  if (ratio <= 0.52) return "Strong Fit";
  if (ratio <= 0.58) return "Workable";
  if (ratio <= 0.62) return "Tight";
  return "Below Market";
}

export function payRangeFitBadgeClass(fit: PayRangeFit | null | undefined): string {
  switch (fit) {
    case "Strong Fit":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Workable":
      return "bg-green-100 text-green-800 border-green-200";
    case "Tight":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "Below Market":
      return "bg-red-100 text-red-800 border-red-200";
    case "Requires Review":
      return "bg-orange-100 text-orange-900 border-orange-200";
    case "Unavailable":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function buildPayFirstExplanation(input: {
  payMin: number | null;
  payMax: number | null;
  payRangeFit?: PayRangeFit | null;
  fillabilityLabel?: string | null;
  submissionCount?: number | null;
  marketRateWarning?: string | null;
  netMarginPercent?: number | null;
}): string {
  const range = formatPayRange(input.payMin, input.payMax);
  const fill = input.fillabilityLabel
    ? ` The role has ${input.fillabilityLabel.toLowerCase()} candidate availability`
    : "";
  const competition =
    input.submissionCount == null
      ? ""
      : input.submissionCount <= 2
        ? " with low current competition"
        : input.submissionCount > 10
          ? " with high current competition"
          : "";
  const fit = input.payRangeFit
    ? ` Pay range fit: ${input.payRangeFit}.`
    : "";
  const warning = input.marketRateWarning
    ? ` ${input.marketRateWarning}`
    : "";

  let text = `Recommended pay is ${range}.${fit}${fill}${competition}.`;
  if (
    input.netMarginPercent != null &&
    Number.isFinite(input.netMarginPercent)
  ) {
    text += ` Secondary margin context: ${input.netMarginPercent.toFixed(1)}%.`;
  }
  return `${text}${warning}`.trim();
}
