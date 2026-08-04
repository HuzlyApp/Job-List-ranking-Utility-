import "server-only";
import OpenAI from "openai";

const timeout = Number(process.env.GROK_TIMEOUT_MS || 120000);
const maxRetries = Number(process.env.GROK_MAX_RETRIES || 2);

/**
 * Centralized default Grok model (vision-capable).
 * Override with GROK_MODEL — do not hardcode elsewhere.
 */
const DEFAULT_GROK_MODEL = "grok-2-vision-1212";

export const GROK_MODEL = process.env.GROK_MODEL || DEFAULT_GROK_MODEL;

export const GROK_PROVIDER = "xai" as const;

function requireXaiApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("XAI_API_KEY is not configured.");
  }
  return key;
}

let _client: OpenAI | null = null;

export function getGrokClient(): OpenAI {
  if (_client) return _client;

  _client = new OpenAI({
    apiKey: requireXaiApiKey(),
    baseURL: process.env.GROK_BASE_URL || "https://api.x.ai/v1",
    timeout,
    maxRetries,
  });

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
const VISION_MODEL_HINTS = ["vision", "grok-2", "grok-3", "grok-4"];

export function assertGrokSupportsImages(model: string = GROK_MODEL): void {
  const lower = model.toLowerCase();
  const supports = VISION_MODEL_HINTS.some((hint) => lower.includes(hint));
  if (!supports) {
    throw new Error(
      `Configured Grok model "${model}" does not support image input. ` +
        `Set GROK_MODEL to a vision-capable model (e.g. grok-2-vision-1212).`
    );
  }
}

export function getGrokConfigMeta() {
  return {
    provider: GROK_PROVIDER,
    model: GROK_MODEL,
    timeoutMs: timeout,
    maxRetries,
    baseUrlConfigured: Boolean(process.env.GROK_BASE_URL || true),
  };
}
