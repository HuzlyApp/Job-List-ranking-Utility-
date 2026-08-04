import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return url;
}

const sql = neon(requireDatabaseUrl());

export const db = drizzle(sql, { schema });

/** Retry transient Neon HTTP / fetch failures. */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; label?: string } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const transient =
        /Failed query|fetch failed|ECONNRESET|ETIMEDOUT|timeout|503|502|429|network/i.test(
          message
        );
      if (!transient || i === attempts) {
        throw err;
      }
      const delayMs = 250 * i * i;
      console.warn("[db.retry]", {
        label: options.label ?? "query",
        attempt: i,
        delayMs,
        error: message.slice(0, 160),
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}

/** User-facing message — never dump raw SQL from Neon driver errors. */
export function sanitizeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Failed query/i.test(message)) {
    return "Database temporarily unavailable. Please retry in a moment.";
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return "Database request timed out. Please retry.";
  }
  if (/ECONNRESET|fetch failed|network/i.test(message)) {
    return "Could not reach the database. Please retry.";
  }
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}
