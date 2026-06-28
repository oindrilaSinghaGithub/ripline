/**
 * Recurrence rule expander for calendar rendering.
 *
 * Parses the subset of iCal RRULE strings that Ripline generates and
 * determines whether a recurring task should appear on a given calendar day.
 *
 * Supported formats (matching what nl-parser.ts and the LLM produce):
 *   FREQ=DAILY
 *   FREQ=WEEKLY
 *   FREQ=WEEKLY;BYDAY=MO
 *   FREQ=WEEKLY;BYDAY=MO,WE,FR
 *   FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR        (every weekday)
 *   FREQ=WEEKLY;BYDAY=SA,SU                 (every weekend)
 *   FREQ=MONTHLY;BYMONTHDAY=1
 *   FREQ=YEARLY
 *
 * BYDAY mapping (iCal two-letter codes → JS getDay() values):
 *   SU=0, MO=1, TU=2, WE=3, TH=4, FR=5, SA=6
 *
 * Timezone: dateKey is already in IST ("YYYY-MM-DD"), so we parse it as
 * local midnight — no UTC shift can occur.
 */

import { localDateKey } from "@/lib/tz";

// ─── iCal BYDAY code → JS getDay() ───────────────────────────────────────────

const BYDAY_TO_DOW: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

// ─── Parse a minimal RRULE string into a structured object ───────────────────

interface ParsedRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  byDay: number[];        // JS getDay() values (0–6), empty = every occurrence
  byMonthDay: number[];   // day-of-month numbers, e.g. [1, 15]
}

function parseRule(rrule: string): ParsedRule {
  const result: ParsedRule = { freq: null, byDay: [], byMonthDay: [] };

  for (const part of rrule.split(";")) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;

    switch (key.trim().toUpperCase()) {
      case "FREQ":
        result.freq = value.trim().toUpperCase() as ParsedRule["freq"];
        break;
      case "BYDAY":
        result.byDay = value
          .split(",")
          .map((code) => BYDAY_TO_DOW[code.trim().toUpperCase()])
          .filter((v): v is number => v !== undefined);
        break;
      case "BYMONTHDAY":
        result.byMonthDay = value
          .split(",")
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => !isNaN(n));
        break;
    }
  }

  return result;
}

// ─── Core check: does this recurrence fire on `dateKey`? ─────────────────────

/**
 * Returns true if a task with the given recurrenceRule should appear on
 * the calendar day identified by `dateKey` ("YYYY-MM-DD" in IST).
 *
 * `startDateKey` is the original task dueDate converted to an IST date key.
 * Occurrences are only shown on or after the task's start date.
 */
export function occursOnDay(
  rrule: string,
  startDateKey: string,   // "YYYY-MM-DD" — IST date of the task's dueDate
  targetDateKey: string,  // "YYYY-MM-DD" — calendar cell we're checking
): boolean {
  // Don't show before the task's start date
  if (targetDateKey < startDateKey) return false;

  const rule = parseRule(rrule);
  if (!rule.freq) return false;

  // Parse both keys as local noon to avoid any timezone ambiguity
  const [ty, tm, td] = targetDateKey.split("-").map(Number);
  const target = new Date(ty, tm - 1, td, 12, 0, 0);
  const targetDow = target.getDay();         // 0=Sun … 6=Sat
  const targetDom = target.getDate();        // 1–31

  switch (rule.freq) {
    case "DAILY":
      if (rule.byDay.length > 0) {
        // FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR → weekdays only
        return rule.byDay.includes(targetDow);
      }
      return true; // plain FREQ=DAILY: every day

    case "WEEKLY":
      if (rule.byDay.length > 0) {
        // FREQ=WEEKLY;BYDAY=MO → every Monday
        return rule.byDay.includes(targetDow);
      }
      // Plain FREQ=WEEKLY: same day of week as start date
      const [sy, sm, sd] = startDateKey.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd, 12, 0, 0);
      return targetDow === start.getDay();

    case "MONTHLY":
      if (rule.byMonthDay.length > 0) {
        return rule.byMonthDay.includes(targetDom);
      }
      // Plain FREQ=MONTHLY: same day-of-month as start
      const [ssy, ssm, ssd] = startDateKey.split("-").map(Number);
      return targetDom === ssd;

    case "YEARLY":
      // Same month and day as start
      const [yyy, ymm, ydd] = startDateKey.split("-").map(Number);
      return target.getMonth() + 1 === ymm && targetDom === ydd;

    default:
      return false;
  }
}

// ─── Next occurrence calculator ──────────────────────────────────────────────

/**
 * Given a recurrence rule and a reference date (the occurrence just completed),
 * return the next Date on which the task should recur.
 *
 * `afterDate` is treated as the date of the occurrence that was just completed.
 * We advance at least one day past it and find the first matching day.
 *
 * Returns null only if the rule is unparseable.
 */
export function nextOccurrenceAfter(rrule: string, afterDate: Date): Date | null {
  const rule = parseRule(rrule);
  if (!rule.freq) return null;

  // Start searching from the day after afterDate
  const cursor = new Date(afterDate);
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(afterDate.getHours(), afterDate.getMinutes(), afterDate.getSeconds(), 0);

  // Safety cap: don't search more than 400 days out
  const limit = new Date(cursor);
  limit.setDate(limit.getDate() + 400);

  while (cursor <= limit) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    // Use the original afterDate as startDateKey so occurrences before start are blocked
    const startDateKey = `${afterDate.getFullYear()}-${String(afterDate.getMonth() + 1).padStart(2, "0")}-${String(afterDate.getDate()).padStart(2, "0")}`;

    if (occursOnDay(rrule, startDateKey, dateKey)) {
      return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

// ─── Virtual task instance ────────────────────────────────────────────────────

/**
 * A lightweight proxy of a recurring task stamped to a specific calendar day.
 * Carries all the same fields as a real Task so calendar rendering code
 * needs no changes — it receives the same Task type from groupTasksByDay.
 */
export type RecurringTaskInstance<T> = T & {
  _isRecurringInstance: true;
  _instanceDateKey: string;
};

/**
 * Expand recurring tasks into virtual instances for every day in `dateKeys`.
 *
 * Rules:
 * - Tasks without recurrenceRule are skipped (handled by groupTasksByDay).
 * - Tasks that are already expanded instances (_isRecurringInstance) are also
 *   skipped — safeguard against double-expansion.
 * - Each instance gets a stable composite id: `${taskId}_${dateKey}` so React
 *   keys are unique per day and any hypothetical duplicate call produces the
 *   same id (dedupable at the rendering layer).
 * - dueDate is replaced with local noon on that day so IST formatters work.
 * - status is derived per-occurrence from completedOccurrences (if present on
 *   the task type), NOT from the master task.status. This ensures that completing
 *   one occurrence does not mark every future occurrence as completed.
 */
export function expandRecurringTasks<T extends {
  id: string;
  dueDate: Date | null;
  recurrenceRule: string | null;
}>(
  tasks: T[],
  allDateKeys: string[], // all "YYYY-MM-DD" keys present in the current view
): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const task of tasks) {
    // Skip non-recurring tasks — handled by groupTasksByDay
    if (!task.recurrenceRule) continue;

    // Safeguard: skip tasks that are already expanded instances
    if ("_isRecurringInstance" in task && (task as Record<string, unknown>)["_isRecurringInstance"] === true) continue;

    // Build a Set of completed date keys from completedOccurrences for O(1) lookup.
    // completedOccurrences is a DateTime[] stored as UTC; we derive the date key
    // using the same UTC-date logic used when storing (06:30 UTC = noon IST = same date).
    const completedSet = new Set<string>();
    const occArr = (task as Record<string, unknown>)["completedOccurrences"];
    if (Array.isArray(occArr)) {
      for (const ts of occArr) {
        const d = ts instanceof Date ? ts : new Date(ts as string);
        const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        completedSet.add(k);
      }
    }

    // Determine the recurrence start: use the task's own dueDate in IST,
    // or fall back to the first key in the view if dueDate is null.
    const startDateKey = task.dueDate
      ? localDateKey(new Date(task.dueDate))
      : allDateKeys[0] ?? "1970-01-01";

    for (const dateKey of allDateKeys) {
      if (!occursOnDay(task.recurrenceRule, startDateKey, dateKey)) continue;

      // Build a virtual instance with dueDate set to noon on that day
      const [y, m, d] = dateKey.split("-").map(Number);
      const instanceDate = new Date(y, m - 1, d, 12, 0, 0);

      // Derive per-occurrence status from completedOccurrences, not master status
      const occurrenceStatus = completedSet.has(dateKey) ? "COMPLETED" : "PENDING";

      const instance: RecurringTaskInstance<T> = {
        ...task,
        // Stable composite id: taskId + date — unique per occurrence, deterministic
        id: `${task.id}_${dateKey}`,
        dueDate: instanceDate as unknown as T["dueDate"],
        // Override status with occurrence-level value
        ...(("status" in task) ? { status: occurrenceStatus } : {}),
        _isRecurringInstance: true,
        _instanceDateKey: dateKey,
      };

      const list = map.get(dateKey) ?? [];
      list.push(instance as unknown as T);
      map.set(dateKey, list);
    }
  }

  return map;
}
