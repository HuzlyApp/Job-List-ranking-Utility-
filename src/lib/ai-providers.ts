import "server-only";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { z } from "zod";
import type {
  ClaudeExtractionOutput,
  ClaudePayAnalysisOutput,
} from "@/types";
import { ClaudeExtractionSchema, ClaudePayAnalysisSchema } from "@/types";
import {
  assertGrokSupportsImages,
  getGrokClient,
  getGrokConfigMeta,
  GROK_MODEL,
} from "@/lib/grok-provider";
import {
  GROK_EXTRACTION_SYSTEM_PROMPT,
  GROK_PAY_ANALYSIS_SYSTEM_PROMPT,
  GROK_PROMPT_VERSION,
} from "@/ai/prompts/job-ranking-grok-v1";
import { normalizeGrokPayAnalysisPayload } from "@/lib/pay-normalization";

/** Max jobs per Grok pay-analysis request to avoid truncation / timeouts. */
const PAY_ANALYSIS_CHUNK_SIZE = 12;

// ------------------------------------------------------------------------------
// Internal Service Interface (provider-agnostic contract preserved)
// ------------------------------------------------------------------------------

export interface RequisitionIntelligenceService {
  extractRequisitions(
    input: RequisitionExtractionInput
  ): Promise<ClaudeExtractionOutput>;

  estimatePayAndFillability(
    input: PayAndFillabilityInput
  ): Promise<ClaudePayAnalysisOutput>;
}

export interface RequisitionExtractionInput {
  images?: Array<{
    filename: string;
    base64: string;
    mimeType: string;
  }>;
  spreadsheets?: Array<{
    filename: string;
    rows: Array<Record<string, unknown>>;
  }>;
  mspProgramName?: string;
  promptVersion: string;
}

export interface PayAndFillabilityInput {
  jobs: Array<{
    requisition_id: string;
    job_title: string | null;
    customer: string | null;
    location: string | null;
    duration: string | null;
    c2c_bill_rate: number | null;
    position_type: string | null;
    remote_or_onsite: string | null;
    submissions: number | null;
  }>;
  promptVersion: string;
}

export type GrokCallMeta = {
  provider: "xai";
  model: string;
  promptVersion: string;
  requestId?: string | null;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  repairAttempted: boolean;
  correlationId?: string;
};

// ------------------------------------------------------------------------------
// Grok Implementation (xAI OpenAI-compatible API)
// ------------------------------------------------------------------------------

export class GrokRequisitionService implements RequisitionIntelligenceService {
  private model: string;
  private promptVersion: string;

  constructor(model?: string) {
    this.model = model || GROK_MODEL;
    this.promptVersion = GROK_PROMPT_VERSION;
  }

  async extractRequisitions(
    input: RequisitionExtractionInput
  ): Promise<ClaudeExtractionOutput> {
    if (input.images && input.images.length > 0) {
      assertGrokSupportsImages(this.model);
    }

    const systemPrompt = GROK_EXTRACTION_SYSTEM_PROMPT;
    const userContent = this.buildExtractionUserContent(input);
    const { text } = await this.callGrok(systemPrompt, userContent, {
      jsonObject: true,
      maxTokens: 8192,
    });
    const parsed = this.extractJsonFromResponse(text);

    const validated = await this.validateWithRepair(
      parsed,
      ClaudeExtractionSchema,
      systemPrompt,
      userContent,
      8192
    );

    return validated as ClaudeExtractionOutput;
  }

  async estimatePayAndFillability(
    input: PayAndFillabilityInput
  ): Promise<ClaudePayAnalysisOutput> {
    if (input.jobs.length === 0) {
      return { jobs: [] };
    }

    // Chunk large batches so Grok responses stay within token/timeout limits
    if (input.jobs.length > PAY_ANALYSIS_CHUNK_SIZE) {
      const allJobs: ClaudePayAnalysisOutput["jobs"] = [];
      for (let i = 0; i < input.jobs.length; i += PAY_ANALYSIS_CHUNK_SIZE) {
        const chunk = input.jobs.slice(i, i + PAY_ANALYSIS_CHUNK_SIZE);
        const partial = await this.estimatePayAndFillability({
          ...input,
          jobs: chunk,
        });
        allJobs.push(...partial.jobs);
      }
      return { jobs: allJobs };
    }

    const systemPrompt = GROK_PAY_ANALYSIS_SYSTEM_PROMPT;
    const userContent = this.buildPayAnalysisUserContent(input);
    const { text } = await this.callGrok(systemPrompt, userContent, {
      jsonObject: true,
      maxTokens: 8192,
    });
    const parsed = this.extractJsonFromResponse(text);
    const normalized = normalizeGrokPayAnalysisPayload(parsed);

    const validated = await this.validateWithRepair(
      normalized,
      ClaudePayAnalysisSchema,
      systemPrompt,
      userContent,
      8192,
      /* normalizeOnRepair */ true
    );

    return validated as ClaudePayAnalysisOutput;
  }

  private async callGrok(
    system: string,
    content: ChatCompletionContentPart[],
    options: { jsonObject: boolean; maxTokens: number }
  ): Promise<{ text: string; requestId: string | null; usage: { input?: number; output?: number } }> {
    const client = getGrokClient();
    const started = Date.now();

    try {
      const response = await client.chat.completions.create({
        model: this.model,
        max_tokens: options.maxTokens,
        ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new Error("Empty response from Grok.");
      }

      const latencyMs = Date.now() - started;
      console.info("[grok.request]", {
        ...getGrokConfigMeta(),
        model: this.model,
        promptVersion: this.promptVersion,
        latencyMs,
        requestId: response.id ?? null,
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        status: "ok",
      });

      return {
        text,
        requestId: response.id ?? null,
        usage: {
          input: response.usage?.prompt_tokens,
          output: response.usage?.completion_tokens,
        },
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : "Unknown Grok error";
      const sanitized = sanitizeGrokError(message);
      console.error("[grok.request]", {
        ...getGrokConfigMeta(),
        model: this.model,
        latencyMs,
        status: "error",
        error: sanitized,
      });
      throw new Error(sanitized);
    }
  }

  private buildExtractionUserContent(
    input: RequisitionExtractionInput
  ): ChatCompletionContentPart[] {
    const blocks: ChatCompletionContentPart[] = [];

    blocks.push({
      type: "text",
      text: `Extract all visible MSP requisitions from the provided files. Prompt version: ${input.promptVersion || this.promptVersion}`,
    });

    if (input.images) {
      for (const img of input.images) {
        const mediaType = normalizeMimeType(img.mimeType);
        blocks.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${img.base64}`,
          },
        });
        blocks.push({
          type: "text",
          text: `Screenshot filename: ${img.filename}`,
        });
      }
    }

    if (input.spreadsheets && input.spreadsheets.length > 0) {
      blocks.push({
        type: "text",
        text: `Spreadsheet context (already parsed deterministically):\n${JSON.stringify(
          input.spreadsheets.map((s) => ({
            filename: s.filename,
            rows: s.rows.slice(0, 50),
          })),
          null,
          2
        )}`,
      });
    }

    return blocks;
  }

  private buildPayAnalysisUserContent(
    input: PayAndFillabilityInput
  ): ChatCompletionContentPart[] {
    return [
      {
        type: "text",
        text: `Analyze competitive W-2 pay ranges and fillability for these requisitions using market-first pay rules. Prompt version: ${input.promptVersion || this.promptVersion}\n\n${JSON.stringify(input.jobs, null, 2)}`,
      },
    ];
  }

  private extractJsonFromResponse(text: string): unknown {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1]);
    }
    return JSON.parse(text);
  }

  private async validateWithRepair<T extends z.ZodTypeAny>(
    data: unknown,
    schema: T,
    systemPrompt: string,
    userContent: ChatCompletionContentPart[],
    maxTokens: number,
    normalizeOnRepair = false
  ): Promise<z.infer<T>> {
    const initial = schema.safeParse(data);
    if (initial.success) {
      return initial.data;
    }

    const validationErrors = initial.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");

    console.warn("[grok.validation.failed]", {
      issueCount: initial.error.issues.length,
      sample: validationErrors.slice(0, 500),
    });

    const repairContent: ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `The previous response failed validation. Fix the JSON and return ONLY corrected JSON.

Validation errors:
${validationErrors}

CRITICAL PAY FIELD RULES:
- recommended_w2_pay_min and recommended_w2_pay_max must be positive numbers (e.g. 72) or null
- Do NOT return currency strings, "/hr" suffixes, or zero when uncertain — use null
- market_pay_floor must be a positive number or null
- Do not invent zero-dollar pay recommendations

Expected schema matches the original system prompt. Return corrected JSON only.`,
      },
      {
        type: "text",
        text: `Original response to repair:\n${JSON.stringify(data, null, 2)}`,
      },
    ];

    // Keep original user context available for repair without re-running full extraction images
    const repairUserContent =
      userContent.length === 1 && userContent[0].type === "text"
        ? [...userContent, ...repairContent]
        : repairContent;

    const { text: repairResponse } = await this.callGrok(
      systemPrompt,
      repairUserContent,
      { jsonObject: true, maxTokens }
    );
    let repairedData = this.extractJsonFromResponse(repairResponse);
    if (normalizeOnRepair) {
      repairedData = normalizeGrokPayAnalysisPayload(repairedData);
    }

    const repaired = schema.safeParse(repairedData);
    if (repaired.success) {
      return repaired.data;
    }

    throw new Error(
      `Grok response validation failed and repair also failed. Correlation may be checked in server logs.`
    );
  }
}

function normalizeMimeType(mime: string): string {
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ]);
  if (allowed.has(mime)) {
    return mime === "image/jpg" ? "image/jpeg" : mime;
  }
  return "image/png";
}

function sanitizeGrokError(message: string): string {
  let sanitized = message;
  // Never leak API keys if they somehow appear in error text
  sanitized = sanitized.replace(/xai-[A-Za-z0-9_-]+/g, "[redacted]");
  sanitized = sanitized.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");

  if (/401|unauthorized|authentication/i.test(sanitized)) {
    return "Grok authentication failed. Verify XAI_API_KEY.";
  }
  if (/429|rate.?limit/i.test(sanitized)) {
    return "Grok rate limit exceeded. Retry shortly.";
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(sanitized)) {
    return "Grok request timed out. Try again or increase GROK_TIMEOUT_MS.";
  }
  if (/model|not found|invalid/i.test(sanitized) && /model/i.test(sanitized)) {
    return `Invalid or unavailable Grok model configuration. Check GROK_MODEL.`;
  }

  // Truncate verbose provider bodies
  if (sanitized.length > 280) {
    return `${sanitized.slice(0, 280)}…`;
  }
  return sanitized;
}

// ------------------------------------------------------------------------------
// Factory — Grok only (no silent fallback to prior providers)
// ------------------------------------------------------------------------------

export function createRequisitionIntelligenceService(
  model?: string
): RequisitionIntelligenceService {
  return new GrokRequisitionService(model);
}

/** Explicit alias for clarity in call sites / tests */
export function createGrokRequisitionService(
  model?: string
): RequisitionIntelligenceService {
  return new GrokRequisitionService(model);
}
