/**
 * MockAIExtractionService — heuristic fallback extractor.
 *
 * Used when no OpenAI API key is set, or as a safety net when the LLM returns
 * nothing. Implements the same event-keyword recognition and confidence-scoring
 * logic as the LLM prompt (Steps 5 & 8) so quality is consistent regardless of
 * which path runs.
 */

import { randomUUID } from "crypto";
import { TaskSuggestionSchema } from "./suggestion-schema";
import { cleanTitle } from "./suggestion-quality";
import type { AIExtractionService, ExtractionResult, SourceMimeType, TaskSuggestion } from "./types";

// ─── Event type keywords → category + priority boost ─────────────────────────

const CATEGORY_KEYWORDS: Array<{
  category: TaskSuggestion["category"];
  re: RegExp;
}> = [
  {
    category: "ACADEMIC",
    re: /\b(assignment|homework|essay|exam|test|quiz|viva|study|lecture|thesis|course|professor|grade|submit|deadline|lab|tutorial|dissertation|project\s+report)\b/i,
  },
  {
    category: "WORK",
    re: /\b(meeting|client|report|sprint|deploy|review|standup|project|manager|presentation|invoice|proposal|conference|workshop|interview|demo|release|deadline)\b/i,
  },
  {
    category: "PERSONAL",
    re: /\b(gym|doctor|dentist|family|dinner|birthday|vacation|shop|grocery|workout|personal|friend|appointment|travel|flight|hotel|renew|subscription|bill|payment|insurance)\b/i,
  },
];

// ─── Event-type keywords that indicate a meaningful event ────────────────────
// The heuristic uses these to decide whether a chunk is task-worthy, and to
// boost confidence scores (matching Steps 5 & 8 of the spec).

const EVENT_SIGNALS: Array<{ re: RegExp; confidenceBoost: number }> = [
  { re: /\b(?:deadline|due|final|last\s+date|closing\s+date)\b/i,           confidenceBoost: 0.25 },
  { re: /\b(?:submit|submission|upload|hand\s*in)\b/i,                      confidenceBoost: 0.22 },
  { re: /\b(?:exam|test|quiz|viva|assessment|midterm|final\s+exam)\b/i,     confidenceBoost: 0.20 },
  { re: /\b(?:meeting|standup|call|appointment|interview)\b/i,               confidenceBoost: 0.18 },
  { re: /\b(?:presentation|demo|conference|workshop|seminar|webinar)\b/i,   confidenceBoost: 0.18 },
  { re: /\b(?:payment|pay|invoice|bill|renewal|subscription|fee|rent)\b/i,  confidenceBoost: 0.18 },
  { re: /\b(?:starts?|begins?|opens?|commences?|launches?|registration)\b/i, confidenceBoost: 0.15 },
  { re: /\b(?:ends?|closes?|concludes?|closing|last\s+day)\b/i,             confidenceBoost: 0.15 },
  { re: /\b(?:assignment|project|report|homework|task)\b/i,                 confidenceBoost: 0.12 },
  { re: /\b(?:hackathon|sprint|release|birthday|reminder|booking)\b/i,      confidenceBoost: 0.12 },
];

// ─── Date extraction ──────────────────────────────────────────────────────────

const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => Date | null }> = [
  {
    // "by January 15", "on Jan 15", "Jan 15th", "30th June", "June 30"
    re: /\b(?:by|on|before|due)?\s*(?:(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?)(?:\s+(\d{4}))?\b/i,
    parse: (m) => {
      const MONTHS: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11,
      };
      // Group 1+2: "15th June" style; Group 3+4: "June 15" style
      const day = parseInt(m[1] ?? m[4], 10);
      const monthStr = (m[2] ?? m[3] ?? "").toLowerCase().slice(0, 3);
      const month = MONTHS[monthStr];
      if (month === undefined || isNaN(day)) return null;
      const year = m[5] ? parseInt(m[5], 10) : new Date().getFullYear();
      const d = new Date(year, month, day, 23, 59, 0);
      if (d < new Date() && !m[5]) d.setFullYear(d.getFullYear() + 1);
      return d;
    },
  },
  {
    // DD/MM/YYYY or DD-MM-YYYY
    re: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
    parse: (m) => {
      const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 23, 59, 0);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  {
    // "next Monday", "this Friday"
    re: /\b(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    parse: (m) => {
      const DAYS: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const target = DAYS[m[1].toLowerCase()];
      if (target === undefined) return null;
      const now = new Date();
      const d = new Date(now);
      const diff = (target - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(23, 59, 0, 0);
      return d;
    },
  },
  {
    // "in 3 days", "in 2 weeks"
    re: /\bin\s+(\d+)\s+(day|days|week|weeks)\b/i,
    parse: (m) => {
      const n = parseInt(m[1], 10);
      const d = new Date();
      if (m[2].toLowerCase().startsWith("week")) d.setDate(d.getDate() + n * 7);
      else d.setDate(d.getDate() + n);
      d.setHours(23, 59, 0, 0);
      return d;
    },
  },
  {
    re: /\btomorrow\b/i,
    parse: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 0, 0);
      return d;
    },
  },
  {
    re: /\btoday\b/i,
    parse: () => {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      return d;
    },
  },
  {
    re: /\bthis\s+evening\b/i,
    parse: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      return d;
    },
  },
  {
    re: /\bthis\s+weekend\b/i,
    parse: () => {
      const d = new Date();
      const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSat);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];

function extractDueDate(text: string): string | null {
  for (const { re, parse } of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const d = parse(m);
      if (d) return d.toISOString();
    }
  }
  return null;
}

function detectCategory(text: string): TaskSuggestion["category"] {
  for (const { category, re } of CATEGORY_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return "OTHER";
}

function detectPriority(text: string): TaskSuggestion["priority"] {
  if (/\b(urgent|asap|immediately|critical|emergency|high.priority|exam|final|deadline)\b/i.test(text)) return "HIGH";
  if (/\b(important|soon|submit|meeting|appointment|interview|should|need\s+to)\b/i.test(text)) return "MEDIUM";
  return "LOW";
}

/**
 * Compute confidence from 0.45 base using keyword signals (Steps 5 & 8).
 * Higher when event keywords + date are present; lower for bare text.
 */
function scoreConfidence(chunk: string, dueDate: string | null): number {
  let score = 0.45;
  for (const { re, confidenceBoost } of EVENT_SIGNALS) {
    if (re.test(chunk)) {
      score += confidenceBoost;
      break; // one dominant keyword is enough — avoid double-counting
    }
  }
  if (dueDate) score += 0.08;
  if (chunk.length > 40) score += 0.04;
  // Cap and round
  return Math.min(Math.round(score * 100) / 100, 0.99);
}

// ─── Chunk splitting ──────────────────────────────────────────────────────────

const ACTION_VERBS =
  /\b(submit|finish|complete|send|write|read|review|prepare|schedule|fix|call|buy|book|register|pay|attend|study|deliver|update|create|build|test|deploy|contact|follow.?up|check|upload|download|present|meet|interview|join|start|begin|end|close|launch|release)\b/i;

const TASK_MARKERS =
  /\b(todo|to-do|to do|task:|action:|need to|must|should|have to|don'?t forget|remember to|make sure to|be sure to|please|deadline|due|submit|exam|meeting|appointment|hackathon|workshop|conference|seminar|payment|invoice|bill)\b/i;

function splitIntoChunks(text: string): string[] {
  const raw = text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  return raw.filter((chunk) => ACTION_VERBS.test(chunk) || TASK_MARKERS.test(chunk));
}

function buildSnippet(text: string, maxLen = 120): string {
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

// ─── Fallback suggestion when no chunks match ─────────────────────────────────

function makeFallbackSuggestion(text: string): TaskSuggestion {
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  return TaskSuggestionSchema.parse({
    id: randomUUID(),
    title: firstSentence.slice(0, 80) || "Untitled task",
    description: "No specific action items were detected. Review and edit as needed.",
    dueDate: null,
    priority: "MEDIUM",
    category: "OTHER",
    recurrenceRule: null,
    reminderOffsets: [],
    confidenceScore: 0.25,
    extractedSourceSnippet: buildSnippet(text),
    needsReview: true,
    validationErrors: [],
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MockAIExtractionService implements AIExtractionService {
  async extractFromText(
    text: string,
    _mimeType: SourceMimeType,
  ): Promise<ExtractionResult> {
    // Simulate processing latency
    await new Promise((r) => setTimeout(r, 600));

    if (!text || text.trim().length < 5) {
      return { success: false, error: "Input text is too short to extract tasks from." };
    }

    const chunks = splitIntoChunks(text);

    if (chunks.length === 0) {
      return { success: true, suggestions: [makeFallbackSuggestion(text)] };
    }

    const suggestions: TaskSuggestion[] = chunks.slice(0, 10).map((chunk) => {
      // Build a clean title: strip list markers, task prefixes, metadata labels
      const stripped = chunk
        .replace(/^[-•*>\s✓✗→]+/, "")
        .replace(/^(todo|to-do|to do|task:|action:)\s*/i, "")
        .trim();

      // Use cleanTitle to strip metadata label prefixes and fix truncation
      const title = cleanTitle(stripped) || stripped;
      const dueDate = extractDueDate(chunk);
      const priority = detectPriority(chunk);
      const category = detectCategory(chunk);

      // Compute reminder offsets matching the LLM prompt behaviour
      let reminderOffsets: string[] = [];
      if (dueDate) {
        if (priority === "HIGH") reminderOffsets = ["-P1D", "-PT1H"];
        else if (priority === "MEDIUM") reminderOffsets = ["-PT1H"];
        else reminderOffsets = ["-PT30M"];
      }

      return TaskSuggestionSchema.parse({
        id: randomUUID(),
        title,
        description: chunk.length > title.length ? chunk : null,
        dueDate,
        priority,
        category,
        recurrenceRule: null,
        reminderOffsets,
        confidenceScore: scoreConfidence(chunk, dueDate),
        extractedSourceSnippet: buildSnippet(chunk),
        needsReview: false,
        validationErrors: [],
      });
    });

    return { success: true, suggestions };
  }
}
