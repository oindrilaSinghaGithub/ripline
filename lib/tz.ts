/**
 * Timezone utilities for Ripline.
 *
 * All dates are stored as UTC in the database.
 * All dates are displayed in Asia/Kolkata (IST, UTC+5:30) for the UI.
 *
 * Core rule:
 *   - NEVER use date.toISOString().slice(0, 10) for display/grouping —
 *     that gives the UTC date, which shifts by -5:30 for IST users.
 *   - ALWAYS use localDateKey() or formatInIST() for anything the user sees.
 */

export const USER_TZ = "Asia/Kolkata";

/**
 * Return the calendar date key ("YYYY-MM-DD") for a Date object
 * in the user's local timezone (IST).
 *
 * Example:
 *   new Date("2026-06-28T00:00:00+05:30")
 *   → stored as 2026-06-27T18:30:00Z in DB
 *   → toISOString().slice(0,10) → "2026-06-27"  ← WRONG (UTC date)
 *   → localDateKey()             → "2026-06-28"  ← CORRECT (IST date)
 */
export function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    // en-CA gives "YYYY-MM-DD" format natively
    timeZone: USER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Return the "today" date key in IST.
 * Use this everywhere instead of toDateKey(new Date()).
 */
export function todayKey(): string {
  return localDateKey(new Date());
}

/**
 * Format a Date for display with date + time in IST.
 * e.g. "Jun 28, 2026, 11:30 PM"
 */
export function formatInIST(
  date: Date,
  opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...opts,
    timeZone: USER_TZ,
  }).format(date);
}

/**
 * Format a Date for display with only date in IST (no time).
 * e.g. "Saturday, June 28, 2026"
 */
export function formatDateOnlyInIST(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: USER_TZ,
  }).format(date);
}

/**
 * Format a Date for a short label in IST.
 * e.g. "Jun 28"
 */
export function formatShortInIST(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: USER_TZ,
  }).format(date);
}

/**
 * Given a "YYYY-MM-DD" date key, produce a human-readable label
 * by parsing it as noon IST (so no timezone shift).
 * e.g. "2026-06-28" → "Saturday, June 28"
 */
export function dateKeyToLabel(dateKey: string): string {
  // Append T12:00:00 in IST to prevent any date shifting
  const [y, m, d] = dateKey.split("-").map(Number);
  // Construct as local noon — avoids UTC midnight rollover
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: USER_TZ,
  }).format(date);
}

/**
 * Check if a date is overdue relative to "now" in IST.
 */
export function isOverdueInIST(dueDate: Date): boolean {
  return dueDate < new Date();
}
