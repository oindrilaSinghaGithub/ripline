/**
 * Zod schema for TaskSuggestion — single source of truth.
 *
 * Used by:
 *   - output-validator.ts  (parse + validate LLM output)
 *   - types.ts             (infer the TypeScript type from this schema)
 *
 * Rules encoded here:
 *   - title        required, non-empty, ≤200 chars
 *   - dueDate      ISO 8601 datetime string or null; normalised to UTC ISO string
 *   - recurrenceRule  must start with FREQ= if present, or null
 *   - reminderOffsets each must be a negative ISO 8601 duration (e.g. -PT1H, -P1D)
 *   - priority / category  strictly-typed enums, coerced from any casing
 *   - confidenceScore  clamped to [0, 0.99]
 */

import { z } from "zod";
import { randomUUID } from "crypto";

// ─── Shared regex patterns ────────────────────────────────────────────────────

/**
 * Negative ISO 8601 duration.
 * Must begin with -P, followed by at least one designator.
 * Examples: -PT30M, -PT1H, -PT2H30M, -P1D, -P3D, -P1W
 */
export const ISO_NEGATIVE_DURATION_RE =
  /^-P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

/**
 * Minimal iCal RRULE — must begin with FREQ=.
 * Full RRULE spec is too complex to validate strictly here; we accept any string
 * that starts with FREQ= and contains only printable ASCII (no injection).
 */
export const RRULE_RE = /^FREQ=[A-Z]+(?:;[A-Z0-9=,+\-]+)*$/;

// ─── Field-level schemas ──────────────────────────────────────────────────────

/**
 * Normalise a raw date value to an ISO 8601 UTC string.
 * Accepts ISO strings, common human formats, epoch numbers.
 * Returns null on parse failure.
 */
const dueDateSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return new Date(val).toISOString();
    if (typeof val !== "string") return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  },
  z.string().datetime({ offset: true }).nullable()
    .describe("ISO 8601 UTC datetime or null"),
);

const prioritySchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toUpperCase() : val),
  z.enum(["LOW", "MEDIUM", "HIGH"]).catch("MEDIUM"),
);

const categorySchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toUpperCase() : val),
  z.enum(["ACADEMIC", "WORK", "PERSONAL", "OTHER"]).catch("OTHER"),
);

const recurrenceRuleSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === "") return null;
    return typeof val === "string" ? val.trim() : null;
  },
  z
    .string()
    .regex(RRULE_RE, {
      message:
        "recurrenceRule must be a valid iCal RRULE string starting with FREQ= (e.g. FREQ=WEEKLY;BYDAY=FR)",
    })
    .nullable(),
);

const reminderOffsetItemSchema = z
  .string()
  .trim()
  .regex(ISO_NEGATIVE_DURATION_RE, {
    message:
      "Each reminderOffset must be a negative ISO 8601 duration (e.g. -PT30M, -PT1H, -P1D)",
  });

const reminderOffsetsSchema = z.preprocess(
  (val) => (Array.isArray(val) ? val : []),
  z.array(reminderOffsetItemSchema),
);

const confidenceScoreSchema = z.preprocess(
  (val) => {
    const n = typeof val === "number" ? val : parseFloat(String(val));
    if (isNaN(n)) return 0.5;
    return Math.max(0, Math.min(0.99, n));
  },
  z.number().min(0).max(0.99),
);

// ─── Core schema (what the LLM must produce) ─────────────────────────────────

export const TaskSuggestionCoreSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "title is required and must be non-empty" })
    .max(200, { message: "title must be 200 characters or fewer" }),

  description: z.preprocess(
    (val) =>
      val === null || val === undefined
        ? null
        : typeof val === "string" && val.trim() === ""
          ? null
          : val,
    z.string().trim().nullable(),
  ),

  dueDate: dueDateSchema,

  priority: prioritySchema,

  category: categorySchema,

  recurrenceRule: recurrenceRuleSchema,

  reminderOffsets: reminderOffsetsSchema,

  confidenceScore: confidenceScoreSchema,

  extractedSourceSnippet: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 300) : ""),
    z.string(),
  ),
});

// ─── Full schema (with Ripline metadata added by the validator) ───────────────

export const TaskSuggestionSchema = TaskSuggestionCoreSchema.extend({
  /** Stable client-side identifier, added by the validator (not from LLM) */
  id: z.string().uuid().default(() => randomUUID()),

  /** True if any field failed strict validation but the suggestion was kept */
  needsReview: z.boolean().default(false),

  /** Human-readable explanations for each field that failed, keyed by field name */
  validationErrors: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .default([]),
});

// ─── TypeScript types inferred from the schemas ───────────────────────────────

export type TaskSuggestionCore = z.infer<typeof TaskSuggestionCoreSchema>;
export type ValidatedTaskSuggestion = z.infer<typeof TaskSuggestionSchema>;

/** Matches the validationErrors array shape */
export type ValidationError = { field: string; message: string };
