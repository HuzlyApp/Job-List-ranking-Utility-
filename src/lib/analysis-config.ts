import "server-only";

/**
 * Typed configuration for requisition pay-analysis (xAI Grok).
 * Models are restricted to IDs confirmed available on this project's xAI account.
 */

export const CONFIRMED_XAI_ANALYSIS_MODELS = [
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-0309-reasoning",
  "grok-4.3",
  "grok-4.5",
  "grok-build-0.1",
] as const;

export type ConfirmedXaiAnalysisModel =
  (typeof CONFIRMED_XAI_ANALYSIS_MODELS)[number];

export type AnalysisMode = "fast" | "quality";

export type AnalysisRuntimeConfig = {
  mode: AnalysisMode;
  model: ConfirmedXaiAnalysisModel;
  qualityModel: ConfirmedXaiAnalysisModel;
  fastModel: ConfirmedXaiAnalysisModel;
  concurrency: number;
  chunkSize: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  /** Explicit override from XAI_ANALYSIS_MODEL or GROK_MODEL when set */
  modelOverridden: boolean;
};

const DEFAULT_FAST_MODEL: ConfirmedXaiAnalysisModel =
  "grok-4.20-0309-non-reasoning";
const DEFAULT_QUALITY_MODEL: ConfirmedXaiAnalysisModel = "grok-4.5";

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  opts?: { min?: number; max?: number }
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const rounded = Math.floor(n);
  const min = opts?.min ?? 1;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, rounded));
}

function assertConfirmedModel(
  model: string,
  source: string
): ConfirmedXaiAnalysisModel {
  if (
    (CONFIRMED_XAI_ANALYSIS_MODELS as readonly string[]).includes(model)
  ) {
    return model as ConfirmedXaiAnalysisModel;
  }
  throw new Error(
    `Invalid ${source}="${model}". Allowed models: ${CONFIRMED_XAI_ANALYSIS_MODELS.join(", ")}. ` +
      `No silent fallback is applied.`
  );
}

function resolveMode(): AnalysisMode {
  const raw = (process.env.XAI_ANALYSIS_MODE || "fast").toLowerCase().trim();
  if (raw === "fast" || raw === "quality") return raw;
  throw new Error(
    `Invalid XAI_ANALYSIS_MODE="${process.env.XAI_ANALYSIS_MODE}". Use "fast" or "quality".`
  );
}

/**
 * Resolve the active pay-analysis model and runtime knobs from environment.
 * Precedence: XAI_ANALYSIS_MODEL (hard override) → mode-selected fast/quality default.
 * GROK_MODEL is NOT used for pay-analysis selection (it remains available for vision extraction).
 */
export function getAnalysisRuntimeConfig(): AnalysisRuntimeConfig {
  const mode = resolveMode();
  const fastModel = assertConfirmedModel(
    process.env.XAI_ANALYSIS_FAST_MODEL || DEFAULT_FAST_MODEL,
    "XAI_ANALYSIS_FAST_MODEL"
  );
  const qualityModel = assertConfirmedModel(
    process.env.XAI_ANALYSIS_QUALITY_MODEL ||
      process.env.XAI_ANALYSIS_MODEL_QUALITY ||
      DEFAULT_QUALITY_MODEL,
    "XAI_ANALYSIS_QUALITY_MODEL"
  );

  const explicit = process.env.XAI_ANALYSIS_MODEL?.trim() || "";
  const modelOverridden = Boolean(explicit);
  const model = modelOverridden
    ? assertConfirmedModel(explicit, "XAI_ANALYSIS_MODEL")
    : mode === "quality"
      ? qualityModel
      : fastModel;

  return {
    mode,
    model,
    fastModel,
    qualityModel,
    concurrency: parsePositiveInt(process.env.XAI_ANALYSIS_CONCURRENCY, 3, {
      min: 1,
      max: 6,
    }),
    chunkSize: parsePositiveInt(process.env.XAI_ANALYSIS_CHUNK_SIZE, 10, {
      min: 1,
      max: 20,
    }),
    maxOutputTokens: parsePositiveInt(
      process.env.XAI_ANALYSIS_MAX_OUTPUT_TOKENS,
      1600,
      { min: 400, max: 8192 }
    ),
    timeoutMs: parsePositiveInt(
      process.env.XAI_ANALYSIS_TIMEOUT_MS || process.env.GROK_TIMEOUT_MS,
      120000,
      { min: 10000, max: 600000 }
    ),
    maxRetries: parsePositiveInt(
      process.env.XAI_ANALYSIS_MAX_RETRIES || process.env.GROK_MAX_RETRIES,
      2,
      { min: 0, max: 5 }
    ),
    modelOverridden,
  };
}

export function getAnalysisModel(): ConfirmedXaiAnalysisModel {
  return getAnalysisRuntimeConfig().model;
}
