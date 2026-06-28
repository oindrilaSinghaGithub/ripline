/**
 * MockAIExtractionService
 *
 * Parses the input text with simple heuristics to produce plausible task
 * suggestions. Replace this class — or wire a real LLM behind the interface —
 * without changing any UI code.
 *
 * Swap strategy:
 *   import { MockAIExtractionService } from "@/lib/ai/mock-extraction-service";
 *   // → replace with:
 *   import { OpenAIExtractionService } from "@/lib/ai/openai-extraction-service";
 *   // Both implement AIExtractionService.
 */

import { randomUUID } from "crypto";
import { TaskSuggestionSchema } from "./suggestion-schema";
import type { AIExtractionService, ExtractionResult, SourceMimeType, TaskSuggestion } from "./types";

// ─── Keyword → category mapping ──────────────────────────────────────────────
const CATEGORY_KEYWORDS: Array<{
  category: TaskSuggestion["category"];
  keywords: RegExp;
}> = [
  { category: "ACADEMIC", keywords: /\b(assignment|homework|essay|exam|study|lecture|thesis|course|professor|grade|submit|deadline)\b/i },
  { category: "WORK",     keywords: /\b(meeting|client|report|sprint|deploy|review|standup|project|manager|presentation|invoice|proposal)\b/i },
  { category: "PERSONAL", keywords: /\b(gym|doctor|dentist|family|dinner|birthday|vacation|shop|grocery|workout|personal|friend)\b/i },
];

// ─── Simple due-date extraction ───────────────────────────────────────────────
const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => Date | null }> = [
  {
    // "by January 15", "on Jan 15", "Jan 15th"
    re: /\b(?:by|on|before|due)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    parse: (m) => {
      const months: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11,
      };
      const month = months[m[1].toLowerCase()];
      if (month === undefined) return null;
      const day = parseInt(m[2], 10);
      const now = new Date();
      const d = new Date(now.getFullYear(), month, day, 23, 59, 0);
      // Roll to next year if already past
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    },
  },
  {
    // "next Monday", "this Friday"
    re: /\b(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    parse: (m) => {
      const days: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const target = days[m[1].toLowerCase()];
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
      const unit = m[2].toLowerCase();
      const d = new Date();
      if (unit.startsWith("week")) d.setDate(d.getDate() + n * 7);
      else d.setDate(d.getDate() + n);
      d.setHours(23, 59, 0, 0);
      return d;
    },
  },
  {
    // "tomorrow"
    re: /\btomorrow\b/i,
    parse: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 0, 0);
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
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.test(text)) return category;
  }
  return "OTHER";
}

function detectPriority(text: string): TaskSuggestion["priority"] {
  if (/\b(urgent|asap|immediately|critical|emergency|high.priority)\b/i.test(text)) return "HIGH";
  if (/\b(soon|important|medium|moderate)\b/i.test(text)) return "MEDIUM";
  return "LOW";
}

/**
 * Split input into sentence-like chunks that look like action items.
 * Returns only chunks that resemble a task (contain a verb + object pattern).
 */
function splitIntoChunks(text: string): string[] {
  // Split on newlines and sentence terminators
  const raw = text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  // Keep chunks that contain action-like verbs
  const ACTION_VERBS = /\b(submit|finish|complete|send|write|read|review|prepare|schedule|fix|call|buy|book|register|pay|attend|study|deliver|update|create|build|test|deploy|contact|follow up|check|upload|download)\b/i;
  const TASK_MARKERS = /\b(todo|to-do|to do|task:|action:|need to|must|should|have to|don'?t forget|remember to|make sure to|be sure to|please)\b/i;

  return raw.filter((chunk) => ACTION_VERBS.test(chunk) || TASK_MARKERS.test(chunk));
}

function buildSnippet(text: string, maxLen = 120): string {
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

// ─── Mock confidence: higher when more signals are present ───────────────────
function scoreConfidence(chunk: string): number {
  let score = 0.45; // base
  if (/\b(due|by|before|deadline)\b/i.test(chunk)) score += 0.15;
  if (/\b(urgent|asap|important)\b/i.test(chunk)) score += 0.1;
  if (chunk.length > 30) score += 0.05;
  if (chunk.length > 60) score += 0.05;
  if (CATEGORY_KEYWORDS.some(({ keywords }) => keywords.test(chunk))) score += 0.1;
  return Math.min(Math.round(score * 100) / 100, 0.99);
}

// ─── Fallback when no action-item chunks are found ───────────────────────────
function makeFallbackSuggestion(text: string): TaskSuggestion {
  const snippet = buildSnippet(text);
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
    extractedSourceSnippet: snippet,
    needsReview: false,
    validationErrors: [],
  });
}

// ─── Service implementation ───────────────────────────────────────────────────
export class MockAIExtractionService implements AIExtractionService {
  async extractFromText(text: string, _mimeType: SourceMimeType): Promise<ExtractionResult> {
    // Simulate async processing latency
    await new Promise((r) => setTimeout(r, 600));

    if (!text || text.trim().length < 5) {
      return { success: false, error: "Input text is too short to extract tasks from." };
    }

    const chunks = splitIntoChunks(text);

    if (chunks.length === 0) {
      return { success: true, suggestions: [makeFallbackSuggestion(text)] };
    }

    const suggestions: TaskSuggestion[] = chunks.slice(0, 10).map((chunk) => {
      // Build a clean title: remove leading task markers
      const cleaned = chunk
        .replace(/^[-•*>\s]+/, "")
        .replace(/^(todo|to-do|to do|task:|action:)\s*/i, "")
        .trim();
      const title = cleaned.slice(0, 80);

      return TaskSuggestionSchema.parse({
        id: randomUUID(),
        title: title || chunk.slice(0, 80),
        description: chunk.length > title.length ? chunk : null,
        dueDate: extractDueDate(chunk),
        priority: detectPriority(chunk),
        category: detectCategory(chunk),
        recurrenceRule: null,
        reminderOffsets: [],
        confidenceScore: scoreConfidence(chunk),
        extractedSourceSnippet: buildSnippet(chunk),
        needsReview: false,
        validationErrors: [],
      });
    });

    return { success: true, suggestions };
  }
}
