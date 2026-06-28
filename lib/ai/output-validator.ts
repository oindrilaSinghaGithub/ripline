/**
 * Output validator — mandatory gate before any AI suggestion reaches the UI.
 *
 * Validation strategy
 * ───────────────────
 * Two-pass approach per item:
 *
 *   Pass 1 — strict parse (TaskSuggestionCoreSchema)
 *     All fields must match exactly. If pass 1 succeeds the item is clean.
 *
 *   Pass 2 — lenient parse (field-by-field with .catch() defaults)
 *     Runs only when pass 1 failed. Invalid fields are replaced with safe
 *     defaults. The item is kept but flagged:
 *       needsReview: true
 *       validationErrors: [{ field, message }, ...]
 *
 * An item is only fully dropped if:
 *   - it is not an object, OR
 *   - `title` is missing / empty (there is nothing to show the user)
 *
 * This means the UI always gets something to review, and the user can see
 * exactly which fields were auto-corrected before confirming.
 *
 * Date normalisation
 * ──────────────────
 * All date strings are normalised to full UTC ISO 8601 format
 * (e.g. "2025-07-15T23:59:00.000Z") by the Zod preprocessing step in
 * suggestion-schema.ts — no additional normalisation is needed here.
 *
 * Logging
 * ───────
 * Every validation failure is logged with structured context so it shows up
 * in server logs (Vercel, CloudWatch, etc.) without leaking to the client.
 */

import { randomUUID } from "crypto";
import { ZodError } from "zod";
import {
  TaskSuggestionCoreSchema,
  TaskSuggestionSchema,
} from "./suggestion-schema";
import type { TaskSuggestion } from "./types";

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_PREFIX = "[output-validator]";

function logValidationFailure(
  context: string,
  index: number,
  error: ZodError,
  raw: unknown,
): void {
  const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  console.warn(
    `${LOG_PREFIX} ${context} — item ${index} has ${issues.length} issue(s):`,
    issues.join(" | "),
  );
  if (process.env.NODE_ENV === "development") {
    console.debug(
      `${LOG_PREFIX} raw item ${index}:`,
      JSON.stringify(raw).slice(0, 400),
    );
  }
}

function logMalformedOutput(stage: string, detail: string, rawContent?: string): void {
  console.error(`${LOG_PREFIX} [malformed-output] ${stage}: ${detail}`);
  if (rawContent && process.env.NODE_ENV === "development") {
    console.debug(
      `${LOG_PREFIX} raw content (first 600 chars):`,
      rawContent.slice(0, 600),
    );
  }
}

// ─── JSON extraction from raw LLM string ─────────────────────────────────────

function extractJSON(rawContent: string): unknown {
  let str = rawContent.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) str = fenceMatch[1].trim();

  // Try direct parse
  try {
    return JSON.parse(str);
  } catch {
    // Try to extract an array or object from anywhere in the string
    const arrayMatch = str.match(/\[[\s\S]*\]/);
    const objectMatch = str.match(/\{[\s\S]*\}/);
    const candidate = arrayMatch?.[0] ?? objectMatch?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Unwrap common LLM wrapper shapes ────────────────────────────────────────

function unwrapToArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;

  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["tasks", "suggestions", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // Single task object — wrap it
    return [parsed];
  }

  return null;
}

// ─── Per-item validation ──────────────────────────────────────────────────────

/**
 * Try strict parse first. On failure, run lenient parse and attach errors.
 * Returns null only if the item has no usable title.
 */
function validateItem(raw: unknown, index: number): TaskSuggestion | null {
  // Must be an object
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    logMalformedOutput(
      "item-type",
      `Item ${index} is ${Array.isArray(raw) ? "array" : typeof raw}, expected object`,
    );
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Title is non-negotiable — nothing to show without it
  const rawTitle =
    typeof obj.title === "string" ? obj.title.trim() : "";
  if (!rawTitle) {
    logMalformedOutput("missing-title", `Item ${index} has no title — dropping`);
    return null;
  }

  // ── Pass 1: strict validation ──────────────────────────────────────────────
  const strictResult = TaskSuggestionCoreSchema.safeParse(raw);

  if (strictResult.success) {
    // Clean suggestion — add metadata and return
    return TaskSuggestionSchema.parse({
      ...strictResult.data,
      id: randomUUID(),
      needsReview: false,
      validationErrors: [],
    });
  }

  // ── Pass 2: lenient parse — collect errors, keep with safe defaults ────────
  logValidationFailure("strict-parse", index, strictResult.error, raw);

  // Build a human-readable error list for the UI
  const validationErrors = strictResult.error.issues.map((issue) => ({
    field: issue.path.join(".") || "unknown",
    message: issue.message,
  }));

  // The Zod schema uses .catch() defaults on every optional field, so a
  // fresh parse of the same raw object will always succeed.
  const lenientResult = TaskSuggestionSchema.parse({
    ...raw,
    id: randomUUID(),
    needsReview: true,
    validationErrors,
  });

  console.info(
    `${LOG_PREFIX} Item ${index} kept with needsReview=true (${validationErrors.length} error(s))`,
  );

  return lenientResult;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type BatchValidationResult =
  | { success: true; suggestions: TaskSuggestion[]; skipped: number }
  | { success: false; error: string };

/**
 * Parse, validate, and normalise the raw string returned by the LLM.
 *
 * This is the mandatory gate between AI output and the UI.
 * It NEVER throws. All failures are returned as structured results.
 *
 * @param rawContent  The raw string from the LLM response
 * @param source      Identifier for logging (e.g. "OpenAI", "heuristic")
 */
export function validateLLMOutput(
  rawContent: string,
  source = "LLM",
): BatchValidationResult {
  // ── 1. Non-empty check ────────────────────────────────────────────────────
  if (!rawContent?.trim()) {
    logMalformedOutput("empty-response", `${source} returned empty content`);
    return { success: false, error: `${source} returned an empty response.` };
  }

  // ── 2. JSON extraction ────────────────────────────────────────────────────
  const parsed = extractJSON(rawContent);

  if (parsed === null) {
    logMalformedOutput(
      "json-parse-failure",
      `${source} output contains no valid JSON`,
      rawContent,
    );
    return {
      success: false,
      error: `${source} response contains no valid JSON. Check server logs for the raw output.`,
    };
  }

  // ── 3. Unwrap to array ────────────────────────────────────────────────────
  const rawArray = unwrapToArray(parsed);

  if (!rawArray) {
    logMalformedOutput(
      "unexpected-shape",
      `${source} response is neither an array nor a recognisable wrapper object`,
      rawContent,
    );
    return {
      success: false,
      error: `${source} response has an unexpected shape. Expected a JSON array of tasks.`,
    };
  }

  // ── 4. Empty array — valid, the model found no tasks ─────────────────────
  if (rawArray.length === 0) {
    console.info(`${LOG_PREFIX} ${source} returned 0 tasks (empty array)`);
    return { success: true, suggestions: [], skipped: 0 };
  }

  // ── 5. Validate each item ─────────────────────────────────────────────────
  const suggestions: TaskSuggestion[] = [];
  let skipped = 0;

  for (let i = 0; i < rawArray.length; i++) {
    const result = validateItem(rawArray[i], i);
    if (result !== null) {
      suggestions.push(result);
    } else {
      skipped++;
    }
  }

  // ── 6. Summary logging ────────────────────────────────────────────────────
  const needsReviewCount = suggestions.filter((s) => s.needsReview).length;

  console.info(
    `${LOG_PREFIX} ${source}: ${suggestions.length} kept` +
      (skipped > 0 ? `, ${skipped} dropped (no title)` : "") +
      (needsReviewCount > 0 ? `, ${needsReviewCount} flagged needsReview` : ""),
  );

  if (suggestions.length === 0) {
    return {
      success: false,
      error: `All ${rawArray.length} item(s) from ${source} were dropped (missing title). Check server logs.`,
    };
  }

  return { success: true, suggestions, skipped };
}

// Re-export types that consumers may need
export type { ValidationError } from "./suggestion-schema";
