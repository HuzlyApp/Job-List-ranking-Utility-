import "server-only";
import OpenAI from "openai";
import {
  getAnalysisRuntimeConfig,
  type ConfirmedXaiAnalysisModel,
} from "@/lib/analysis-config";

/**
 * Centralized Grok client. Pay-analysis model selection lives in analysis-config.
 * Override with XAI_ANALYSIS_MODEL / GROK_MODEL — do not hardcode model IDs in call sites.
 */
const DEFAULT_VISION_MODEL: ConfirmedXaiAnalysisModel = "grok-4.5";

function resolveClientTimeout(): number {
  return getAnalysisRuntimeConfig().timeoutMs;
}

function resolveClientRetries(): number {
  return getAnalysisRuntimeConfig().maxRetries;
}

/** Active model for vision extraction (quality) and default display. */
export function getConfiguredGrokModel(): ConfirmedXaiAnalysisModel {
  try {
    return getAnalysisRuntimeConfig().model;
  } catch {
    return DEFAULT_VISION_MODEL;
  }
}

/** @deprecated Prefer getAnalysisRuntimeConfig().model for pay analysis */
export const GROK_MODEL = process.env.GROK_MODEL || DEFAULT_VISION_MODEL;

export const GROK_PROVIDER = "xai" as const;

function requireXaiApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("XAI_API_KEY is not configured.");
  }
  return key;
}

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

export function getGrokClient(): OpenAI {
  const timeout = resolveClientTimeout();
  const maxRetries = resolveClientRetries();
  const key = `${timeout}:${maxRetries}`;
  if (_client && _clientKey === key) return _client;

  _client = new OpenAI({
    apiKey: requireXaiApiKey(),
    baseURL: process.env.GROK_BASE_URL || "https://api.x.ai/v1",
    timeout,
    maxRetries,
  });
  _clientKey = key;
  return _client;
}

/** @deprecated Use getGrokClient — kept for clarity in call sites */
export const grokClient = {
  get instance() {
    return getGrokClient();
  },
};

/**
 * Models known to support image input. If GROK_MODEL is set to a text-only
 * model and images are supplied, callers must fail clearly.
 */
const VISION_MODEL_HINTS = [
  "vision",
  "grok-2",
  "grok-3",
  "grok-4",
  "grok-4.5",
  "grok-4.3",
];

export function assertGrokSupportsImages(model: string = GROK_MODEL): void {
  const lower = model.toLowerCase();
  const supports = VISION_MODEL_HINTS.some((hint) => lower.includes(hint));
  if (!supports) {
    throw new Error(
      `Configured Grok model "${model}" does not support image input. ` +
        `Set GROK_MODEL / XAI_ANALYSIS_QUALITY_MODEL to a vision-capable model (e.g. grok-4.5).`
    );
  }
}

export function getGrokConfigMeta() {
  const cfg = getAnalysisRuntimeConfig();
  return {
    provider: GROK_PROVIDER,
    model: cfg.model,
    mode: cfg.mode,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
    concurrency: cfg.concurrency,
    chunkSize: cfg.chunkSize,
    maxOutputTokens: cfg.maxOutputTokens,
    baseUrlConfigured: Boolean(process.env.GROK_BASE_URL || true),
  };
}
