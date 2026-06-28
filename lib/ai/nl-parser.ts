/**
 * Natural Language Scheduling Parser
 *
 * Parses free-form scheduling commands into TaskSuggestion objects.
 * No external LLM required. Swap parseNLCommand() for an LLM call
 * without changing any UI code.
 *
 * Examples:
 *   "Every Friday I want to practice DSA for 2 hours."
 *   "Remind me to pay rent on the 1st of every month."
 *   "Finish my ML assignment before July 15."
 *   "Book tickets next Monday at 10 AM."
 *   "Study Operating Systems every weekday at 8 PM."
 */

import { randomUUID } from "crypto";
import { TaskSuggestionSchema } from "./suggestion-schema";
import type { TaskSuggestion } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NLParseResult =
  | { success: true; suggestions: TaskSuggestion[] }
  | { success: false; error: string };

// ─── Recurrence patterns ─────────────────────────────────────────────────────

const RECURRENCE_PATTERNS: Array<{ re: RegExp; rule: string }> = [
  { re: /\bevery\s+day\b|\bdaily\b/i,               rule: "FREQ=DAILY" },
  { re: /\bevery\s+weekday\b|\bweekdays\b/i,         rule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR" },
  { re: /\bevery\s+weekend\b|\bweekends\b/i,         rule: "FREQ=WEEKLY;BYDAY=SA,SU" },
  { re: /\bevery\s+week\b|\bweekly\b/i,              rule: "FREQ=WEEKLY" },
  { re: /\bevery\s+month\b|\bmonthly\b/i,            rule: "FREQ=MONTHLY" },
  { re: /\bevery\s+year\b|\bannually\b|\byearly\b/i, rule: "FREQ=YEARLY" },
  { re: /\bevery\s+monday\b/i,      rule: "FREQ=WEEKLY;BYDAY=MO" },
  { re: /\bevery\s+tuesday\b/i,     rule: "FREQ=WEEKLY;BYDAY=TU" },
  { re: /\bevery\s+wednesday\b/i,   rule: "FREQ=WEEKLY;BYDAY=WE" },
  { re: /\bevery\s+thursday\b/i,    rule: "FREQ=WEEKLY;BYDAY=TH" },
  { re: /\bevery\s+friday\b/i,      rule: "FREQ=WEEKLY;BYDAY=FR" },
  { re: /\bevery\s+saturday\b/i,    rule: "FREQ=WEEKLY;BYDAY=SA" },
  { re: /\bevery\s+sunday\b/i,      rule: "FREQ=WEEKLY;BYDAY=SU" },
  {
    re: /\bon\s+the\s+1st\s+of\s+every\s+month\b|\bevery\s+month\s+on\s+the\s+1st\b/i,
    rule: "FREQ=MONTHLY;BYMONTHDAY=1",
  },
  {
    re: /\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\s+of\s+every\s+month\b/i,
    rule: "FREQ=MONTHLY;BYMONTHDAY=$1",
  },
];

function extractRecurrence(text: string): string | null {
  for (const { re, rule } of RECURRENCE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      return rule.replace("$1", m[1] ?? "1");
    }
  }
  return null;
}

// ─── Time extraction ─────────────────────────────────────────────────────────

const TIME_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => { h: number; min: number } | null }> = [
  {
    // "at 10 AM", "at 8 PM", "at 10:30 AM"
    re: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    parse: (m) => {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const meridiem = m[3].toLowerCase();
      if (meridiem === "pm" && h !== 12) h += 12;
      if (meridiem === "am" && h === 12) h = 0;
      return { h, min };
    },
  },
  {
    // "at 20:00", "at 08:00"
    re: /\bat\s+(\d{1,2}):(\d{2})\b/,
    parse: (m) => ({ h: parseInt(m[1], 10), min: parseInt(m[2], 10) }),
  },
];

function extractTime(text: string): { h: number; min: number } | null {
  for (const { re, parse } of TIME_PATTERNS) {
    const m = text.match(re);
    if (m) return parse(m);
  }
  return null;
}

// ─── Date extraction ─────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function nextWeekday(dayIndex: number): Date {
  const now = new Date();
  const diff = (dayIndex - now.getDay() + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d;
}

function extractDueDate(text: string, time: { h: number; min: number } | null): string | null {
  const now = new Date();

  // "before July 15", "by July 15", "on July 15"
  const namedDate = text.match(
    /\b(?:before|by|on|due)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (namedDate) {
    const month = MONTH_MAP[namedDate[1].toLowerCase()];
    const day = parseInt(namedDate[2], 10);
    if (month !== undefined) {
      const d = new Date(now.getFullYear(), month, day, time?.h ?? 23, time?.min ?? 59, 0);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d.toISOString();
    }
  }

  // "next Monday", "this Friday"
  const nextDay = text.match(
    /\b(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (nextDay) {
    const dayIdx = DAY_MAP[nextDay[1].toLowerCase()];
    if (dayIdx !== undefined) {
      const d = nextWeekday(dayIdx);
      d.setHours(time?.h ?? 23, time?.min ?? 59, 0, 0);
      return d.toISOString();
    }
  }

  // Just a weekday name (implies next occurrence)
  const bareDay = text.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (bareDay && !/every/i.test(text)) {
    const dayIdx = DAY_MAP[bareDay[1].toLowerCase()];
    if (dayIdx !== undefined) {
      const d = nextWeekday(dayIdx);
      d.setHours(time?.h ?? 23, time?.min ?? 59, 0, 0);
      return d.toISOString();
    }
  }

  // "tomorrow"
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(time?.h ?? 23, time?.min ?? 59, 0, 0);
    return d.toISOString();
  }

  // "in 3 days", "in 2 weeks"
  const relative = text.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i);
  if (relative) {
    const n = parseInt(relative[1], 10);
    const d = new Date(now);
    if (relative[2].toLowerCase().startsWith("week")) d.setDate(d.getDate() + n * 7);
    else d.setDate(d.getDate() + n);
    d.setHours(time?.h ?? 23, time?.min ?? 59, 0, 0);
    return d.toISOString();
  }

  // If recurrent + has time, set due = today at that time
  if (time) {
    const d = new Date(now);
    d.setHours(time.h, time.min, 0, 0);
    if (d < now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  return null;
}

// ─── Priority detection ───────────────────────────────────────────────────────

function detectPriority(text: string): TaskSuggestion["priority"] {
  if (/\b(urgent|asap|immediately|critical|high.priority|important)\b/i.test(text)) return "HIGH";
  if (/\b(soon|medium|moderate|remind)\b/i.test(text)) return "MEDIUM";
  return "MEDIUM"; // default for scheduling commands is MEDIUM
}

// ─── Category detection ──────────────────────────────────────────────────────

const CATEGORY_MAP: Array<{ cat: TaskSuggestion["category"]; re: RegExp }> = [
  { cat: "ACADEMIC", re: /\b(assignment|homework|exam|study|lecture|thesis|course|ml|dsa|operating systems|algorithms|research|quiz|class)\b/i },
  { cat: "WORK",     re: /\b(meeting|client|report|sprint|deploy|review|standup|project|presentation|invoice|proposal|office|work)\b/i },
  { cat: "PERSONAL", re: /\b(rent|groceries|gym|doctor|dentist|family|dinner|birthday|vacation|workout|ticket|book\s+ticket|personal)\b/i },
];

function detectCategory(text: string): TaskSuggestion["category"] {
  for (const { cat, re } of CATEGORY_MAP) {
    if (re.test(text)) return cat;
  }
  return "OTHER";
}

// ─── Reminder extraction ─────────────────────────────────────────────────────

function extractReminderOffset(text: string): string | null {
  // "remind me X before", "remind me X minutes/hours before"
  const m = text.match(/\bremind\s+(?:me\s+)?(\d+)\s+(minute|minutes|hour|hours)\s+before\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase().startsWith("hour") ? "H" : "M";
    return `-PT${n}${unit}`;
  }
  return null;
}

// ─── Title extraction ─────────────────────────────────────────────────────────

function cleanTitle(text: string): string {
  let t = text
    .replace(/\b(please\s+)?remind\s+(me\s+)?to\s+/i, "")
    .replace(/\bi\s+want\s+to\s+/i, "")
    .replace(/\bi\s+need\s+to\s+/i, "")
    .replace(/\bmake\s+sure\s+to\s+/i, "")
    .replace(/\bdon'?t\s+forget\s+to\s+/i, "")
    .replace(/\bevery\s+(day|daily|week|weekend|weekday|weekdays|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\b(?:before|by|on|due)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, "")
    .replace(/\b(?:next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bfor\s+\d+\s+hours?\b/gi, "")
    .replace(/\bon\s+the\s+\d{1,2}(?:st|nd|rd|th)?\s+of\s+every\s+month\b/gi, "")
    .replace(/\btomorrow\b/gi, "")
    .replace(/\bin\s+\d+\s+(?:day|days|week|weeks)\b/gi, "")
    .replace(/[.!?]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Capitalise first letter
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Confidence scoring ──────────────────────────────────────────────────────

function scoreConfidence(text: string, dueDate: string | null, recurrence: string | null): number {
  let score = 0.55;
  if (dueDate) score += 0.2;
  if (recurrence) score += 0.15;
  if (extractTime(text)) score += 0.05;
  return Math.min(score, 0.99);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseNLCommand(input: string): NLParseResult {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return { success: false, error: "Command is too short. Please describe what you want to schedule." };
  }

  // Split on semicolons / newlines to support multi-command input
  const segments = trimmed
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  if (segments.length === 0) {
    return { success: false, error: "No schedulable commands detected." };
  }

  const suggestions: TaskSuggestion[] = segments.map((segment) => {
    const time = extractTime(segment);
    const dueDate = extractDueDate(segment, time);
    const recurrenceRule = extractRecurrence(segment);
    const reminderOffset = extractReminderOffset(segment);
    const title = cleanTitle(segment);
    const priority = detectPriority(segment);
    const category = detectCategory(segment);

    return TaskSuggestionSchema.parse({
      id: randomUUID(),
      title: title || segment.slice(0, 80),
      description: reminderOffset
        ? `Reminder offset: ${reminderOffset}`
        : null,
      dueDate,
      priority,
      category,
      recurrenceRule,
      reminderOffsets: [],
      confidenceScore: scoreConfidence(segment, dueDate, recurrenceRule),
      extractedSourceSnippet: segment.length > 120 ? segment.slice(0, 120) + "…" : segment,
      needsReview: false,
      validationErrors: [],
    });
  });

  return { success: true, suggestions };
}
