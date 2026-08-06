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
} from "@/lib/grok-provider";
import {
  GROK_EXTRACTION_SYSTEM_PROMPT,
  GROK_PAY_ANALYSIS_SYSTEM_PROMPT,
  GROK_PROMPT_VERSION,
} from "@/ai/prompts/job-ranking-grok-v1";
import { normalizeGrokPayAnalysisPayload } from "@/lib/pay-normalization";
import {
  getAnalysisRuntimeConfig,
  type AnalysisRuntimeConfig,
} from "@/lib/analysis-config";
import {
  computeBackoffMs,
  mapWithConcurrencySettled,
  sleep,
} from "@/lib/concurrency";
import {
  buildPerfSummary,
  computeProgressPercent,
  estimateCompletionIso,
  mergeProgress,
  stageLabel,
  type AnalysisPerfCounters,
  type AnalysisProgressSnapshot,
} from "@/lib/analysis-progress";

export type PayAnalysisProgress = AnalysisProgressSnapshot;

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
  batchId?: string;
  onProgress?: (progress: PayAnalysisProgress) => void | Promise<void>;
  /** Persist each completed chunk immediately (successful + failed terminal rows). */
  onChunkComplete?: (event: {
    chunkIndex: number;
    totalChunks: number;
    jobs: ClaudePayAnalysisOutput["jobs"];
    failedRequisitionIds: string[];
    model: string;
    requestId: string | null;
    modelLatencyMs: number;
    parseLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
  }) => void | Promise<void>;
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

export interface RequisitionIntelligenceService {
  extractRequisitions(
    input: RequisitionExtractionInput
  ): Promise<ClaudeExtractionOutput>;

  estimatePayAndFillability(
    input: PayAndFillabilityInput
  ): Promise<ClaudePayAnalysisOutput>;
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

type ChunkWork = {
  chunkIndex: number;
  jobs: PayAndFillabilityInput["jobs"];
};

function isRetryableGrokError(message: string): boolean {
  return /429|rate.?limit|timeout|ETIMEDOUT|AbortError|503|502|504|overloaded|temporar/i.test(
    message
  );
}

function extractRetryAfterSeconds(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const headers = (err as { headers?: { get?: (k: string) => string | null } })
    .headers;
  const raw =
    headers?.get?.("retry-after") ||
    (err as { response?: { headers?: Record<string, string> } }).response
      ?.headers?.["retry-after"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------------------
// Grok Implementation (xAI OpenAI-compatible API)
// ------------------------------------------------------------------------------

export class GrokRequisitionService implements RequisitionIntelligenceService {
  private model: string;
  private promptVersion: string;
  private config: AnalysisRuntimeConfig;

  constructor(model?: string) {
    this.config = getAnalysisRuntimeConfig();
    this.model = model || this.config.model;
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

    const batchId = input.batchId || "unknown";
    const chunkSize = this.config.chunkSize;
    const concurrency = this.config.concurrency;
    const total = input.jobs.length;
    const chunks: ChunkWork[] = [];
    for (let i = 0; i < total; i += chunkSize) {
      chunks.push({
        chunkIndex: chunks.length,
        jobs: input.jobs.slice(i, i + chunkSize),
      });
    }
    const totalChunks = chunks.length;
    const startedAt = new Date().toISOString();
    const batchStarted = Date.now();

    console.info("[analysis.batch.start]", {
      batchId,
      model: this.model,
      mode: this.config.mode,
      chunkSize,
      concurrency,
      totalRows: total,
      totalChunks,
      maxOutputTokens: this.config.maxOutputTokens,
      promptVersion: input.promptVersion || this.promptVersion,
    });

    let processedRows = 0;
    let successfulRows = 0;
    let failedRows = 0;
    let completedChunks = 0;
    let progressSnapshot = mergeProgress(null, {
      stage: "analyzing_grok",
      totalRows: total,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      totalChunks,
      completedChunks: 0,
      currentChunk: 0,
      selectedModel: this.model,
      startedAt,
      lastActivityAt: startedAt,
      progressPercent: 0,
    });

    /** Serialize progress mutations across concurrent chunk workers */
    let progressGate: Promise<void> = Promise.resolve();
    const withProgressLock = async <T>(fn: () => Promise<T>): Promise<T> => {
      const previous = progressGate;
      let release!: () => void;
      progressGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await fn();
      } finally {
        release();
      }
    };

    const emitProgress = async (
      patch: Partial<AnalysisProgressSnapshot>
    ) => {
      await withProgressLock(async () => {
        progressSnapshot = mergeProgress(progressSnapshot, {
          ...patch,
          lastActivityAt: new Date().toISOString(),
          estimatedCompletionAt: estimateCompletionIso(
            startedAt,
            patch.processedRows ?? progressSnapshot.processedRows,
            total
          ),
        });
        await input.onProgress?.(progressSnapshot);
        console.info("[analysis.progress]", {
          batchId,
          ...progressSnapshot,
          totalElapsedMs: Date.now() - batchStarted,
        });
      });
    };

    await emitProgress({ stage: "analyzing_grok" });

    const counters: AnalysisPerfCounters = {
      promptBuildMsTotal: 0,
      modelLatencyMsTotal: 0,
      modelLatencyMsMax: 0,
      parseLatencyMsTotal: 0,
      databaseLatencyMsTotal: 0,
      inputTokensTotal: 0,
      outputTokensTotal: 0,
      modelRequestCount: 0,
      retryCount: 0,
      sequential: concurrency <= 1,
      concurrency,
      chunkSize,
    };

    const allJobs: ClaudePayAnalysisOutput["jobs"] = [];
    const chunkErrors: string[] = [];

    const settled = await mapWithConcurrencySettled(
      chunks,
      concurrency,
      async (chunk) => {
        const chunkStart = Date.now();
        console.info("[analysis.chunk.start]", {
          batchId,
          chunkIndex: chunk.chunkIndex + 1,
          totalChunks,
          rowCount: chunk.jobs.length,
          model: this.model,
        });

        await emitProgress({
          stage: "analyzing_grok",
          currentChunk: chunk.chunkIndex + 1,
          currentStage: `Evaluating chunk ${chunk.chunkIndex + 1} of ${totalChunks}`,
        });

        const result = await this.estimatePayChunkWithRetry(
          chunk.jobs,
          input.promptVersion,
          counters,
          batchId,
          chunk.chunkIndex
        );

        const returnedIds = new Set(
          result.jobs.map((j) => j.requisition_id)
        );
        const failedRequisitionIds = chunk.jobs
          .map((j) => j.requisition_id)
          .filter((id) => !returnedIds.has(id));

        const dbStarted = Date.now();
        if (input.onChunkComplete) {
          await input.onChunkComplete({
            chunkIndex: chunk.chunkIndex,
            totalChunks,
            jobs: result.jobs,
            failedRequisitionIds,
            model: this.model,
            requestId: result.requestId,
            modelLatencyMs: result.modelLatencyMs,
            parseLatencyMs: result.parseLatencyMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          });
        }
        const databaseLatencyMs = Date.now() - dbStarted;
        counters.databaseLatencyMsTotal += databaseLatencyMs;

        await withProgressLock(async () => {
          successfulRows += result.jobs.length;
          failedRows += failedRequisitionIds.length;
          processedRows = successfulRows + failedRows;
          completedChunks += 1;
        });

        await emitProgress({
          stage:
            completedChunks >= totalChunks ? "complete" : "analyzing_grok",
          processedRows,
          successfulRows,
          failedRows,
          completedChunks,
          currentChunk: chunk.chunkIndex + 1,
          progressPercent: computeProgressPercent(processedRows, total),
          currentStage:
            completedChunks >= totalChunks
              ? stageLabel("complete")
              : `Evaluated ${processedRows} of ${total} requisitions`,
        });

        console.info("[analysis.chunk.complete]", {
          batchId,
          chunkIndex: chunk.chunkIndex + 1,
          totalChunks,
          rowCount: chunk.jobs.length,
          successfulRows: result.jobs.length,
          failedRows: failedRequisitionIds.length,
          model: this.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          modelLatencyMs: result.modelLatencyMs,
          parseLatencyMs: result.parseLatencyMs,
          databaseLatencyMs,
          totalElapsedMs: Date.now() - chunkStart,
          requestId: result.requestId,
        });

        return result.jobs;
      }
    );

    for (const item of settled) {
      if (item.ok) {
        allJobs.push(...item.value);
      } else {
        const message =
          item.error instanceof Error
            ? item.error.message
            : "Grok chunk failed";
        chunkErrors.push(`chunk ${item.index + 1}: ${message}`);
        const failedIds = chunks[item.index].jobs.map((j) => j.requisition_id);
        failedRows += failedIds.length;
        processedRows = successfulRows + failedRows;
        completedChunks += 1;

        const dbStarted = Date.now();
        if (input.onChunkComplete) {
          await input.onChunkComplete({
            chunkIndex: item.index,
            totalChunks,
            jobs: [],
            failedRequisitionIds: failedIds,
            model: this.model,
            requestId: null,
            modelLatencyMs: 0,
            parseLatencyMs: 0,
            inputTokens: 0,
            outputTokens: 0,
          });
        }
        counters.databaseLatencyMsTotal += Date.now() - dbStarted;

        console.error("[analysis.error]", {
          batchId,
          chunkIndex: item.index + 1,
          totalChunks,
          rowCount: failedIds.length,
          model: this.model,
          error: message,
        });

        await emitProgress({
          processedRows,
          successfulRows,
          failedRows,
          completedChunks,
          lastError: message,
          progressPercent: computeProgressPercent(processedRows, total),
          stage:
            completedChunks >= totalChunks
              ? failedRows === total
                ? "failed"
                : "complete"
              : "analyzing_grok",
        });
      }
    }

    if (allJobs.length === 0) {
      const detail = chunkErrors.slice(0, 3).join("; ") || "unknown error";
      throw new Error(
        `Grok returned no pay recommendations for ${total} jobs ` +
          `(${chunkErrors.length}/${totalChunks} chunks failed). ${detail}. ` +
          `Verify XAI_ANALYSIS_MODEL (current: ${this.model}) and XAI_API_KEY.`
      );
    }

    const totalElapsedMs = Date.now() - batchStarted;
    const summary = buildPerfSummary({
      batchId,
      totalElapsedMs,
      counters,
      totalRows: total,
      successfulRows: allJobs.length,
      failedRows: Math.max(0, total - allJobs.length),
    });
    console.info("[analysis.batch.complete]", summary);

    await emitProgress({
      stage: "complete",
      processedRows: total,
      successfulRows: allJobs.length,
      failedRows: Math.max(0, total - allJobs.length),
      completedChunks: totalChunks,
      progressPercent: 100,
      completedAt: new Date().toISOString(),
      estimatedCompletionAt: null,
    });

    return { jobs: allJobs };
  }

  private async estimatePayChunkWithRetry(
    jobs: PayAndFillabilityInput["jobs"],
    promptVersion: string,
    counters: AnalysisPerfCounters,
    batchId: string,
    chunkIndex: number
  ): Promise<{
    jobs: ClaudePayAnalysisOutput["jobs"];
    requestId: string | null;
    modelLatencyMs: number;
    parseLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const maxAttempts = 1 + this.config.maxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.estimatePayChunk(
          jobs,
          promptVersion,
          counters,
          batchId,
          chunkIndex
        );
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const retryable = isRetryableGrokError(message);
        if (!retryable || attempt >= maxAttempts - 1) {
          throw err;
        }
        counters.retryCount += 1;
        const delay = computeBackoffMs(attempt, {
          retryAfterSeconds: extractRetryAfterSeconds(err),
        });
        console.warn("[analysis.chunk.retry]", {
          batchId,
          chunkIndex: chunkIndex + 1,
          attempt: attempt + 1,
          delayMs: delay,
          error: message,
        });
        await sleep(delay);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Grok chunk failed after retries");
  }

  private async estimatePayChunk(
    jobs: PayAndFillabilityInput["jobs"],
    promptVersion: string,
    counters: AnalysisPerfCounters,
    batchId: string,
    chunkIndex: number
  ): Promise<{
    jobs: ClaudePayAnalysisOutput["jobs"];
    requestId: string | null;
    modelLatencyMs: number;
    parseLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const promptStarted = Date.now();
    const systemPrompt = GROK_PAY_ANALYSIS_SYSTEM_PROMPT;
    const userContent = this.buildPayAnalysisUserContent({
      jobs,
      promptVersion,
    } as PayAndFillabilityInput);
    counters.promptBuildMsTotal += Date.now() - promptStarted;
    console.info("[analysis.prompt.built]", {
      batchId,
      chunkIndex: chunkIndex + 1,
      rowCount: jobs.length,
      promptBuildMs: Date.now() - promptStarted,
    });

    console.info("[analysis.model.start]", {
      batchId,
      chunkIndex: chunkIndex + 1,
      model: this.model,
      rowCount: jobs.length,
    });

    const { text, requestId, usage, latencyMs } = await this.callGrok(
      systemPrompt,
      userContent,
      {
        jsonObject: true,
        maxTokens: this.config.maxOutputTokens,
      }
    );

    counters.modelRequestCount += 1;
    counters.modelLatencyMsTotal += latencyMs;
    counters.modelLatencyMsMax = Math.max(
      counters.modelLatencyMsMax,
      latencyMs
    );
    counters.inputTokensTotal += usage.input ?? 0;
    counters.outputTokensTotal += usage.output ?? 0;

    console.info("[analysis.model.complete]", {
      batchId,
      chunkIndex: chunkIndex + 1,
      model: this.model,
      modelLatencyMs: latencyMs,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      requestId,
    });

    const parseStarted = Date.now();
    const parsed = this.extractJsonFromResponse(text);
    const normalized = normalizeGrokPayAnalysisPayload(parsed);

    const validated = await this.validateWithRepair(
      normalized,
      ClaudePayAnalysisSchema,
      systemPrompt,
      userContent,
      this.config.maxOutputTokens,
      /* normalizeOnRepair */ true
    );
    const parseLatencyMs = Date.now() - parseStarted;
    counters.parseLatencyMsTotal += parseLatencyMs;

    console.info("[analysis.parse.complete]", {
      batchId,
      chunkIndex: chunkIndex + 1,
      parseLatencyMs,
      returnedJobs: (validated as ClaudePayAnalysisOutput).jobs.length,
    });

    return {
      jobs: (validated as ClaudePayAnalysisOutput).jobs,
      requestId,
      modelLatencyMs: latencyMs,
      parseLatencyMs,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
    };
  }

  private async callGrok(
    system: string,
    content: ChatCompletionContentPart[],
    options: { jsonObject: boolean; maxTokens: number }
  ): Promise<{
    text: string;
    requestId: string | null;
    usage: { input?: number; output?: number };
    latencyMs: number;
  }> {
    const client = getGrokClient();
    const started = Date.now();

    try {
      const response = await client.chat.completions.create({
        model: this.model,
        max_tokens: options.maxTokens,
        ...(options.jsonObject
          ? { response_format: { type: "json_object" } }
          : {}),
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
        latencyMs,
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
      throw Object.assign(new Error(sanitized), {
        cause: err,
        headers: (err as { headers?: unknown })?.headers,
      });
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
          }))
        )}`,
      });
    }

    return blocks;
  }

  private buildPayAnalysisUserContent(
    input: PayAndFillabilityInput
  ): ChatCompletionContentPart[] {
    // Compact payload: evaluation fields only, no pretty-print whitespace.
    const compactJobs = input.jobs.map((j) => ({
      requisition_id: j.requisition_id,
      job_title: j.job_title,
      customer: j.customer,
      location: j.location,
      duration: j.duration,
      c2c_bill_rate: j.c2c_bill_rate,
      position_type: j.position_type,
      remote_or_onsite: j.remote_or_onsite,
      submissions: j.submissions,
    }));

    return [
      {
        type: "text",
        text: `Analyze competitive W-2 pay + fillability (market-first). Prompt: ${input.promptVersion || this.promptVersion}\n${JSON.stringify({ jobs: compactJobs })}`,
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
        text: `Original response to repair:\n${JSON.stringify(data)}`,
      },
    ];

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
  sanitized = sanitized.replace(/xai-[A-Za-z0-9_-]+/g, "[redacted]");
  sanitized = sanitized.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");

  if (/401|unauthorized|authentication/i.test(sanitized)) {
    return "Grok authentication failed. Verify XAI_API_KEY.";
  }
  if (/429|rate.?limit/i.test(sanitized)) {
    return "Grok rate limit exceeded. Retry shortly.";
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(sanitized)) {
    return "Grok request timed out. Try again or increase XAI_ANALYSIS_TIMEOUT_MS.";
  }
  if (/model|not found|invalid/i.test(sanitized) && /model/i.test(sanitized)) {
    return `Invalid or unavailable Grok model configuration. Check XAI_ANALYSIS_MODEL.`;
  }

  if (sanitized.length > 280) {
    return `${sanitized.slice(0, 280)}…`;
  }
  return sanitized;
}

export function createRequisitionIntelligenceService(
  model?: string
): RequisitionIntelligenceService {
  return new GrokRequisitionService(model);
}

/**
 * Vision / extraction service — always uses a vision-capable quality model.
 * Pay analysis should call createRequisitionIntelligenceService(analysisModel).
 */
export function createExtractionIntelligenceService(): RequisitionIntelligenceService {
  const cfg = getAnalysisRuntimeConfig();
  return new GrokRequisitionService(cfg.qualityModel);
}

export function createGrokRequisitionService(
  model?: string
): RequisitionIntelligenceService {
  return new GrokRequisitionService(model);
}
