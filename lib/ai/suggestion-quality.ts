/**
 * Post-LLM suggestion quality refinement.
 *
 * Runs AFTER schema validation and BEFORE the Review Panel.
 * Applied to BOTH the LLM path and the heuristic fallback path.
 *
 * Responsibilities:
 *   1. extractAllDates()         — deterministic date scan of full document text
 *   2. cleanTitle()              — strip metadata labels, fix truncation
 *   3. inferFallbackTitle()      — context-aware generic title when all else fails
 *   4. getBadTitleReason()       — detect every bad-title category
 *   5. refineSuggestions()       — orchestrate all passes and merge orphans
 */

import type { TaskSuggestion } from "./types";

const LOG = "[suggestion-quality]";

// ─── Metadata-label prefixes ──────────────────────────────────────────────────
// Longer phrases must appear before their shorter substrings so the regex
// alternation matches the most specific option first.

const METADATA_LABEL_PREFIXES = [
  "submission window ends",
  "submission window closes",
  "submission window opens",
  "submission window",
  "submission closes",
  "submission deadline",
  "submission opens",
  "submission ends",
  "submission date",
  "exam date",
  "exam time",
  "meeting time",
  "meeting date",
  "due date",
  "deadline",
  "due",
  "event date",
  "event time",
  "last date",
  "closing date",
  "scheduled",
  "schedule",
  "date",
  "time",
  "opens",
  "closes",
  "starts",
  "ends",
  "begins",
  "commences",
  "venue",
  "location",
  "room",
  "place",
];

// Matches a title that is ONLY a metadata label + optional colon/dash + optional value
const METADATA_LABEL_ONLY = new RegExp(
  `^(?:${METADATA_LABEL_PREFIXES.map((l) => l.replace(/\s+/g, "\\s+")).join("|")})` +
    `(?:\\s*[:\\-]\\s*.*)?$`,
  "i",
);

// Strips a leading "Label: " or "Label - " from a title
const LEADING_LABEL_RE = new RegExp(
  `^(?:${METADATA_LABEL_PREFIXES.map((l) => l.replace(/\s+/g, "\\s+")).join("|")})` +
    `\\s*[:\\-]\\s*`,
  "i",
);

// ─── Words that begin a metadata phrase but are NOT event headings ────────────
// A title that STARTS with one of these words is almost certainly mislabelled.
// e.g. "Deadline for Project X" → bad; "Database Systems Assignment" → good.
const METADATA_START_WORDS = [
  "deadline", "due date", "due", "date", "time",
  "submission ends", "submission opens", "submission closes",
  "submission window", "submission deadline", "submission date",
  "exam date", "exam time", "meeting date", "meeting time",
  "event date", "event time", "last date", "closing date",
  "starts", "ends", "opens", "closes", "begins", "commences",
  "scheduled", "schedule", "venue", "location", "room", "place",
];

// Regex: title starts with a metadata word (word-boundary aware)
const STARTS_WITH_METADATA_RE = new RegExp(
  `^(?:${METADATA_START_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|")})(?:\\s|:|\\-|$)`,
  "i",
);

const DATE_ONLY =
  /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{2,4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{2,4})?|(?:tomorrow|today|yesterday|tonight|this\s+evening|this\s+weekend)|(?:next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month))$/i;

const TIME_ONLY =
  /^\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?$/i;

// Room/venue label or bare numeric code
const ROOM_ONLY =
  /^(?:room|venue|location|hall|lab|auditorium|block)\s*[\w\-]*$|^[A-Z]?\d{2,4}[A-Z]?$/i;

const SUBJECT_CODE = /^[A-Z]{1,3}[\s\-]?\d{3,5}[A-Z]?$/;

const PUNCTUATION_ONLY = /^[^\p{L}\p{N}]+$/u;

// Single trailing letter after a space — "Meeting with R" but NOT "Pay"
const TRUNCATED_WORD = /(?:^|\s)[A-Za-z]$/;

const MEANINGLESS_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "at", "in", "on", "for", "of", "by",
  "am", "pm", "due", "date", "time", "yes", "no", "ok", "na", "n/a",
]);

// ─── Keyword confidence boosters ─────────────────────────────────────────────

const STRONG_EVENT_KEYWORDS: Array<{ re: RegExp; boost: number }> = [
  { re: /\b(?:deadline|due|final|last\s+date|closing\s+date)\b/i,           boost: 0.20 },
  { re: /\b(?:submit|submission|upload|hand\s*in)\b/i,                       boost: 0.22 },
  { re: /\b(?:exam|test|quiz|viva|assessment|midterm)\b/i,                   boost: 0.20 },
  { re: /\b(?:meeting|standup|call|appointment|interview)\b/i,               boost: 0.18 },
  { re: /\b(?:presentation|demo|conference|workshop|seminar|webinar)\b/i,    boost: 0.18 },
  { re: /\b(?:payment|pay|invoice|bill|renewal|subscription|fee|rent)\b/i,  boost: 0.18 },
  { re: /\b(?:starts?|begins?|opens?|commences?|launches?|registration)\b/i, boost: 0.15 },
  { re: /\b(?:ends?|closes?|concludes?|closing|last\s+day)\b/i,              boost: 0.15 },
  { re: /\b(?:assignment|project|report|homework|task)\b/i,                  boost: 0.12 },
  { re: /\b(?:hackathon|sprint|release|birthday|reminder|booking)\b/i,       boost: 0.12 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadTitleReason =
  | "date-only"
  | "time-only"
  | "room-only"
  | "subject-code"
  | "punctuation"
  | "metadata-label"
  | "starts-with-metadata"
  | "truncated"
  | "meaningless";

// ─── Deterministic date extraction (Rule 8) ───────────────────────────────────
// Back-fills dueDate from the extractedSourceSnippet when the LLM returned null.
// Never overwrites an existing dueDate.

const SNIPPET_DATE_PATTERNS: Array<{
  re: RegExp;
  resolve: (m: RegExpMatchArray, now: Date) => Date | null;
}> = [
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/,
    resolve: (m) => {
      const d = new Date(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        m[4] ? parseInt(m[4], 10) : 23, m[5] ? parseInt(m[5], 10) : 59, 0,
      );
      return isNaN(d.getTime()) ? null : d;
    },
  },
  {
    re: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
    resolve: (m) => {
      const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 23, 59, 0);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  {
    re: /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?)(?:,?\s+(\d{4}))?\b/i,
    resolve: (m, now) => {
      const MONTHS: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11,
      };
      const day = parseInt(m[1] ?? m[4], 10);
      const monthStr = (m[2] ?? m[3] ?? "").toLowerCase().slice(0, 3);
      const month = MONTHS[monthStr];
      if (month === undefined || isNaN(day)) return null;
      const year = m[5] ? parseInt(m[5], 10) : now.getFullYear();
      const d = new Date(year, month, day, 23, 59, 0);
      if (!m[5] && d < now) d.setFullYear(d.getFullYear() + 1);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  {
    re: /\btomorrow\b/i,
    resolve: (_m, now) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return d; },
  },
  {
    re: /\btoday\b/i,
    resolve: (_m, now) => { const d = new Date(now); d.setHours(23, 59, 0, 0); return d; },
  },
];

export function extractDateFromSnippet(snippet: string): string | null {
  if (!snippet) return null;
  const now = new Date();
  for (const { re, resolve } of SNIPPET_DATE_PATTERNS) {
    const m = snippet.match(re);
    if (m) {
      try {
        const d = resolve(m, now);
        if (d) return d.toISOString();
      } catch { /* continue */ }
    }
  }
  return null;
}

/**
 * Scan an entire document text and return ALL date strings found, in order.
 * Used by the pipeline to build a date inventory before LLM extraction.
 * The LLM user prompt includes this list so the model can associate dates
 * with events without missing any.
 */
export function extractAllDates(text: string): string[] {
  if (!text) return [];
  const now = new Date();
  const found: string[] = [];
  const seen = new Set<string>();

  // Work line by line so we don't conflate dates from different events
  for (const line of text.split(/\n/)) {
    for (const { re, resolve } of SNIPPET_DATE_PATTERNS) {
      // Use 'g' flag via matchAll to catch all occurrences per line
      const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of line.matchAll(globalRe)) {
        try {
          const d = resolve(m as RegExpMatchArray, now);
          if (d) {
            const iso = d.toISOString();
            if (!seen.has(iso)) { seen.add(iso); found.push(iso); }
          }
        } catch { /* continue */ }
      }
    }
  }
  return found;
}

// ─── Title cleaning ───────────────────────────────────────────────────────────

/**
 * Strip metadata label prefixes and trailing date leakage from a title.
 * Apply safe word-boundary truncation at 200 chars. Never invents content.
 */
export function cleanTitle(raw: string): string {
  let t = raw.trim();

  // Strip leading "Deadline: " / "Due Date - " style prefixes
  const afterLabel = t.replace(LEADING_LABEL_RE, "").trim();
  if (afterLabel && afterLabel !== t) t = afterLabel;

  // Strip trailing ISO date or "Month Day, Year" that leaked into title
  t = t
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:T[\d:.Z+\-]+)?$/, "")
    .replace(/\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?(?:\s+\d{1,2}:\d{2}(?:\s*[ap]m)?)?$/i, "")
    .replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/, "")
    .trim();

  // Word-boundary truncation — never mid-word
  if (t.length > 200) {
    const head = t.slice(0, 200);
    const lastSpace = head.lastIndexOf(" ");
    t = lastSpace > 100 ? head.slice(0, lastSpace).trimEnd() : head;
  }

  return t || raw.trim();
}

// ─── Bad-title detection ──────────────────────────────────────────────────────

export function getBadTitleReason(title: string): BadTitleReason | null {
  const t = title.trim();
  if (!t) return "meaningless";
  if (DATE_ONLY.test(t)) return "date-only";
  if (TIME_ONLY.test(t)) return "time-only";
  if (ROOM_ONLY.test(t)) return "room-only";
  if (SUBJECT_CODE.test(t)) return "subject-code";
  if (PUNCTUATION_ONLY.test(t)) return "punctuation";
  if (METADATA_LABEL_ONLY.test(t)) return "metadata-label";
  // Title begins with a metadata keyword (e.g. "Deadline for Project X")
  if (STARTS_WITH_METADATA_RE.test(t)) return "starts-with-metadata";
  // Only flag truncated when there's a single trailing letter after a space
  if (TRUNCATED_WORD.test(t) && t.includes(" ")) return "truncated";
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2 && words.every((w) => MEANINGLESS_STOPWORDS.has(w))) return "meaningless";
  return null;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function computeKeywordBoost(s: TaskSuggestion): number {
  const corpus = [s.title, s.description ?? "", s.extractedSourceSnippet].join(" ");
  let boost = 0;
  for (const { re, boost: b } of STRONG_EVENT_KEYWORDS) {
    if (re.test(corpus)) { boost += b; break; }
  }
  if (s.dueDate) boost += 0.08;
  return boost;
}

function applyConfidenceBoost(s: TaskSuggestion): TaskSuggestion {
  const boost = computeKeywordBoost(s);
  if (boost === 0) return s;
  const boosted = Math.min(0.99, s.confidenceScore + boost);
  return boosted <= s.confidenceScore ? s : { ...s, confidenceScore: boosted };
}

function appendDescription(target: TaskSuggestion, fragment: string): TaskSuggestion {
  const extra = fragment.trim();
  if (!extra) return target;
  const desc = target.description?.trim();
  return {
    ...target,
    description: desc ? `${desc} | ${extra}` : extra,
    extractedSourceSnippet: target.extractedSourceSnippet || extra.slice(0, 300),
  };
}

function mergeOrphanIntoTarget(
  target: TaskSuggestion,
  orphan: TaskSuggestion,
  reason: BadTitleReason,
): TaskSuggestion {
  let updated = { ...target };
  const fragment = orphan.title.trim();

  if (reason === "date-only" || reason === "time-only") {
    if (!updated.dueDate) {
      const parsed = extractDateFromSnippet(fragment);
      if (parsed) updated.dueDate = parsed;
    }
    updated = appendDescription(updated, fragment);
    if (orphan.dueDate && !updated.dueDate) updated.dueDate = orphan.dueDate;
  } else if (reason === "metadata-label" || reason === "starts-with-metadata") {
    if (orphan.dueDate && !updated.dueDate) updated.dueDate = orphan.dueDate;
    updated = appendDescription(updated, fragment);
  } else if (reason === "truncated") {
    updated = appendDescription(updated, orphan.extractedSourceSnippet || fragment);
  } else {
    updated = appendDescription(updated, fragment);
  }

  if (orphan.description) updated = appendDescription(updated, orphan.description);
  return updated;
}

function shouldFlagForReview(s: TaskSuggestion): boolean {
  if (s.confidenceScore < 0.50) return true;
  const words = s.title.trim().split(/\s+/);
  if (
    words.length === 1 &&
    !/^(pay|submit|review|study|attend|complete|register|schedule|call|book|prepare)$/i.test(words[0])
  ) return true;
  return false;
}

/**
 * When a suggestion has a bad title and no valid neighbour to merge into,
 * infer a context-appropriate generic fallback title rather than using the
 * opaque "Review extracted item".
 *
 * Priority:
 *   1. If we have a dueDate → "Upcoming Deadline"
 *   2. If the source snippet contains a strong event keyword → use it
 *   3. Generic → "Upcoming Event"
 */
function inferFallbackTitle(s: TaskSuggestion): string {
  const corpus = [s.extractedSourceSnippet, s.description ?? ""].join(" ");

  if (/\b(?:exam|test|quiz|viva)\b/i.test(corpus)) return "Upcoming Exam";
  if (/\b(?:meeting|standup|call|appointment)\b/i.test(corpus)) return "Upcoming Meeting";
  if (/\b(?:submit|submission|deadline|due)\b/i.test(corpus)) {
    return s.dueDate ? "Upcoming Deadline" : "Submission Deadline";
  }
  if (/\b(?:hackathon)\b/i.test(corpus)) return "Hackathon Event";
  if (/\b(?:payment|pay|invoice|bill)\b/i.test(corpus)) return "Payment Due";
  if (/\b(?:interview)\b/i.test(corpus)) return "Interview";
  if (/\b(?:workshop|seminar|conference|webinar)\b/i.test(corpus)) return "Upcoming Event";
  if (/\b(?:assignment|project|report|homework)\b/i.test(corpus)) return "Upcoming Deadline";
  if (/\b(?:reminder)\b/i.test(corpus)) return "Reminder";

  return s.dueDate ? "Upcoming Deadline" : "Upcoming Event";
}

// ─── Heading-type words (Priority 2) ─────────────────────────────────────────
// Single-word titles that are heading categories — should be combined with
// the next descriptive line. e.g. "Assignment" + "Database Systems" →
// "Database Systems Assignment"

const HEADING_TYPE_WORDS = new Set([
  "assignment", "project", "report", "presentation", "exam", "invoice",
  "receipt", "meeting", "workshop", "conference", "hackathon", "interview",
  "resume", "application", "registration", "notice", "circular", "quiz",
  "test", "seminar", "webinar", "session", "lecture", "lab", "tutorial",
  "task", "homework", "proposal", "review", "assessment",
]);

/**
 * If a suggestion title is a single heading-type word (e.g. "Assignment"),
 * combine it with the next valid suggestion's title (e.g. "Database Systems")
 * to produce "Database Systems Assignment".
 * Returns the transformed array.
 */
function applyHeadingCombination(suggestions: TaskSuggestion[]): TaskSuggestion[] {
  if (suggestions.length < 2) return suggestions;
  const result: TaskSuggestion[] = [];
  let i = 0;
  while (i < suggestions.length) {
    const s = suggestions[i];
    const word = s.title.trim().toLowerCase();
    // Is this a lone heading-type word?
    if (HEADING_TYPE_WORDS.has(word) && i + 1 < suggestions.length) {
      const next = suggestions[i + 1];
      const nextTitle = next.title.trim();
      // Only combine if the next title is valid and not itself a heading word
      if (nextTitle && !HEADING_TYPE_WORDS.has(nextTitle.toLowerCase()) && !getBadTitleReason(nextTitle)) {
        const combined = `${nextTitle} ${s.title.trim()}`;
        console.info(`${LOG} heading combination: "${s.title}" + "${next.title}" → "${combined}"`);
        result.push({
          ...next,
          title: combined,
          // Inherit dueDate from heading suggestion if next has none
          dueDate: next.dueDate ?? s.dueDate,
          extractedSourceSnippet: s.extractedSourceSnippet || next.extractedSourceSnippet,
        });
        i += 2; // consumed both
        continue;
      }
    }
    result.push(s);
    i++;
  }
  return result;
}

/**
 * Refine a list of TaskSuggestions:
 *   Pass 0 — cleanTitle() strips metadata labels and fixes truncation
 *   Pass 1 — deterministic date backfill from extractedSourceSnippet (Rule 8)
 *   Pass 2 — orphan detection and merging
 *   Pass 3 — confidence boosts and review flags
 */
export function refineSuggestions(suggestions: TaskSuggestion[]): TaskSuggestion[] {
  if (suggestions.length === 0) return suggestions;

  // Pass 0: clean titles
  let working = suggestions.map((s) => ({ ...s, title: cleanTitle(s.title) }));

  // Pass 0b: Priority 2 heading combination
  // "Assignment" + "Database Systems" → "Database Systems Assignment"
  working = applyHeadingCombination(working);

  // Pass 1: deterministic date backfill
  // If dueDate is null, try to extract it from:
  //   a) the title itself (if it looks like a date — the LLM put the date in the wrong field)
  //   b) the extractedSourceSnippet
  working = working.map((s) => {
    if (s.dueDate) return s;

    // Case a: title IS the date — move it to dueDate, the title will be
    // replaced in Pass 2 via getBadTitleReason → "date-only"
    if (DATE_ONLY.test(s.title.trim()) || TIME_ONLY.test(s.title.trim())) {
      const fromTitle = extractDateFromSnippet(s.title);
      if (fromTitle) {
        console.info(`${LOG} moved date from title to dueDate for "${s.title}"`);
        return { ...s, dueDate: fromTitle };
      }
    }

    // Case b: snippet contains a date
    const backfilled = extractDateFromSnippet(s.extractedSourceSnippet);
    if (!backfilled) return s;
    console.info(`${LOG} backfilled dueDate for "${s.title}" from snippet`);
    return { ...s, dueDate: backfilled };
  });

  // Pass 2: orphan detection and merging
  const kept: TaskSuggestion[] = [];
  const orphans: Array<{ index: number; reason: BadTitleReason; suggestion: TaskSuggestion }> = [];

  working.forEach((s, index) => {
    const reason = getBadTitleReason(s.title);
    if (reason) orphans.push({ index, reason, suggestion: s });
    else kept.push({ ...s });
  });

  if (orphans.length > 0) {
    console.info(`${LOG} merging ${orphans.length} fragment title(s) into neighbours`);

    const keptOriginalIndices: number[] = [];
    working.forEach((s, i) => { if (!getBadTitleReason(s.title)) keptOriginalIndices.push(i); });

    for (const orphan of orphans) {
      const prevIdx = keptOriginalIndices.filter((i) => i < orphan.index).length - 1;
      const nextIdx = keptOriginalIndices.findIndex((i) => i > orphan.index);

      if (prevIdx >= 0) {
        kept[prevIdx] = mergeOrphanIntoTarget(kept[prevIdx], orphan.suggestion, orphan.reason);
        console.info(`${LOG} merged "${orphan.suggestion.title}" (${orphan.reason}) → prev "${kept[prevIdx].title}"`);
      } else if (nextIdx >= 0) {
        kept[nextIdx] = mergeOrphanIntoTarget(kept[nextIdx], orphan.suggestion, orphan.reason);
        console.info(`${LOG} merged "${orphan.suggestion.title}" (${orphan.reason}) → next "${kept[nextIdx].title}"`);
      } else {
        // No valid neighbour — extract the date from the bad title if it's
        // a date, then use an inferred fallback title. The date must go to
        // dueDate, never stay in the title.
        const s = orphan.suggestion;
        let dueDate = s.dueDate;

        if (
          (orphan.reason === "date-only" || orphan.reason === "time-only") &&
          !dueDate
        ) {
          // The title IS the date — parse it directly
          dueDate = extractDateFromSnippet(s.title) ?? extractDateFromSnippet(s.extractedSourceSnippet) ?? null;
        } else if (!dueDate) {
          dueDate = extractDateFromSnippet(s.extractedSourceSnippet) ?? null;
        }

        const fallbackTitle = inferFallbackTitle({ ...s, dueDate });
        kept.push({
          ...s,
          title: fallbackTitle,
          dueDate,
          needsReview: true,
          validationErrors: [
            ...(s.validationErrors ?? []),
            { field: "title", message: `Bad title (${orphan.reason}): "${s.title}"` },
          ],
        });
      }
    }
  }

  // Pass 3: confidence boosts and review flags
  const refined = kept.map((s) => {
    const boosted = applyConfidenceBoost(s);
    return { ...boosted, needsReview: boosted.needsReview || shouldFlagForReview(boosted) };
  });

  console.info(`${LOG} ${refined.length} suggestion(s) after refinement`);
  return refined;
}
