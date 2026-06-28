/**
 * Calendar utilities: workload scoring and AI insights.
 * Pure functions — no database calls, no external dependencies.
 *
 * TIMEZONE: All date grouping uses Asia/Kolkata (IST) via localDateKey()
 * from lib/tz.ts. Never use toISOString().slice(0,10) — that returns the
 * UTC date which is 5:30 hours behind IST, causing a -1 day shift.
 */

import type { Task } from "@prisma/client";
import { localDateKey, todayKey } from "@/lib/tz";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkloadLevel = "none" | "low" | "medium" | "high";

export type DayWorkload = {
  date: string; // "YYYY-MM-DD"
  tasks: Task[];
  score: number;
  level: WorkloadLevel;
};

export type CalendarWeek = Array<{
  date: Date;
  dateKey: string; // "YYYY-MM-DD"
  isCurrentMonth: boolean;
  isToday: boolean;
  workload: DayWorkload;
}>;

export type Insight = {
  id: string;
  icon: "clock" | "fire" | "alert" | "check" | "calendar" | "info";
  text: string;
  severity: "neutral" | "warning" | "danger" | "success";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * @deprecated Use localDateKey() from lib/tz.ts instead.
 * Kept only for CalendarGrid which passes pre-built Date objects for
 * grid-cell positions (those are already in local time via new Date(year,month,day)).
 */
export function toDateKey(date: Date): string {
  return localDateKey(date);
}

const PRIORITY_WEIGHT: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Workload scoring ─────────────────────────────────────────────────────────

/**
 * Compute a workload score for a list of tasks on a single day.
 * Score = sum of priority weights. Thresholds: low<3 medium<6 high≥6.
 */
export function scoreDay(tasks: Task[]): { score: number; level: WorkloadLevel } {
  const pending = tasks.filter((t) => t.status === "PENDING");
  if (pending.length === 0) return { score: 0, level: "none" };

  const score = pending.reduce((acc, t) => acc + (PRIORITY_WEIGHT[t.priority] ?? 1), 0);

  let level: WorkloadLevel = "low";
  if (score >= 7) level = "high";
  else if (score >= 3) level = "medium";

  return { score, level };
}

/**
 * Group tasks by their due-date calendar day in IST (Asia/Kolkata).
 *
 * WHY: task.dueDate comes from the DB as a UTC Date. If the task is due
 * 2026-06-28T00:00:00+05:30, it is stored as 2026-06-27T18:30:00Z.
 * Using toISOString().slice(0,10) would bucket it under "2026-06-27" — wrong.
 * localDateKey() interprets the timestamp in IST and returns "2026-06-28".
 *
 * Non-recurring tasks are bucketed by their dueDate.
 * Recurring tasks (those with recurrenceRule) are NOT included here —
 * they are expanded by expandRecurringTasks() and merged at the call site.
 */
export function groupTasksByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.recurrenceRule) continue; // handled by expandRecurringTasks
    if (!task.dueDate) continue;
    const key = localDateKey(new Date(task.dueDate)); // ← IST calendar day
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}

/**
 * Build a full calendar month grid (always 6 weeks × 7 days).
 *
 * Accepts a pre-built `recurringByDay` map produced by a single call to
 * expandRecurringTasks() at the CalendarGrid level. This ensures expansion
 * runs exactly once per render cycle — never inside both buildMonthGrid and
 * buildWeekGrid independently.
 *
 * Grid cell dates are built with new Date(year, month, day) — local-time
 * midnight values — so toDateKey() (→ localDateKey()) returns the correct
 * IST calendar date for each cell.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  tasksByDay: Map<string, Task[]>,
  recurringByDay: Map<string, Task[]>,
): CalendarWeek[] {
  const today = todayKey();
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0 = Sun
  const start = new Date(year, month, 1 - startDow);

  const weeks: CalendarWeek[] = [];
  const cursor = new Date(start);

  for (let w = 0; w < 6; w++) {
    const week: CalendarWeek[0][] = [];
    for (let d = 0; d < 7; d++) {
      const dateKey = toDateKey(cursor);
      const nonRecurring = tasksByDay.get(dateKey) ?? [];
      const recurring = recurringByDay.get(dateKey) ?? [];
      const tasks = [...nonRecurring, ...recurring];
      const { score, level } = scoreDay(tasks);
      week.push({
        date: new Date(cursor),
        dateKey,
        isCurrentMonth: cursor.getMonth() === month,
        isToday: dateKey === today,
        workload: { date: dateKey, tasks, score, level },
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

/**
 * Build a 7-day week grid starting from the Sunday of the given date's week.
 *
 * Accepts the same pre-built `recurringByDay` map as buildMonthGrid — no
 * additional call to expandRecurringTasks() is made here.
 */
export function buildWeekGrid(
  anchorDate: Date,
  tasksByDay: Map<string, Task[]>,
  recurringByDay: Map<string, Task[]>,
): CalendarWeek {
  const today = todayKey();
  const dow = anchorDate.getDay();
  const start = new Date(anchorDate);
  start.setDate(anchorDate.getDate() - dow); // rewind to Sunday

  const week: CalendarWeek = [];
  for (let d = 0; d < 7; d++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + d);
    const dateKey = toDateKey(cur);
    const nonRecurring = tasksByDay.get(dateKey) ?? [];
    const recurring = recurringByDay.get(dateKey) ?? [];
    const tasks = [...nonRecurring, ...recurring];
    const { score, level } = scoreDay(tasks);
    week.push({
      date: cur,
      dateKey,
      isCurrentMonth: true,
      isToday: dateKey === today,
      workload: { date: dateKey, tasks, score, level },
    });
  }
  return week;
}

/**
 * Collect every date key that appears in the month grid (6 × 7 = 42 days)
 * starting from the Sunday before the 1st of the given month.
 * Used by CalendarGrid to compute the expansion window once.
 */
export function monthDateKeys(year: number, month: number): string[] {
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const keys: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 42; i++) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Collect the 7 date keys for the week containing anchorDate (Sun → Sat).
 * Used by CalendarGrid to compute the expansion window once.
 */
export function weekDateKeys(anchorDate: Date): string[] {
  const start = new Date(anchorDate);
  start.setDate(anchorDate.getDate() - anchorDate.getDay()); // rewind to Sunday
  const keys: string[] = [];
  for (let d = 0; d < 7; d++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + d);
    keys.push(toDateKey(cur));
  }
  return keys;
}

// ─── AI Insights (no external LLM) ───────────────────────────────────────────

export function computeInsights(tasks: Task[]): Insight[] {
  const now = new Date();
  const insights: Insight[] = [];

  const pending = tasks.filter((t) => t.status === "PENDING");
  const completed = tasks.filter((t) => t.status === "COMPLETED");
  const withDue = pending.filter((t) => t.dueDate != null);

  // 1. Pending count
  if (pending.length === 0) {
    insights.push({
      id: "all-done",
      icon: "check",
      text: "You have no pending tasks — all caught up! 🎉",
      severity: "success",
    });
  } else {
    insights.push({
      id: "pending-count",
      icon: "clock",
      text: `You have ${pending.length} pending task${pending.length !== 1 ? "s" : ""}.`,
      severity: "neutral",
    });
  }

  // 2. Deadlines in next 48 h
  const cutoff48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const urgent = withDue.filter((t) => new Date(t.dueDate!) <= cutoff48h);
  if (urgent.length > 0) {
    insights.push({
      id: "urgent",
      icon: "alert",
      text: `${urgent.length} deadline${urgent.length !== 1 ? "s" : ""} due within the next 48 hours.`,
      severity: "danger",
    });
  }

  // 3. Overdue tasks
  const overdue = withDue.filter((t) => new Date(t.dueDate!) < now);
  if (overdue.length > 0) {
    insights.push({
      id: "overdue",
      icon: "fire",
      text: `${overdue.length} task${overdue.length !== 1 ? "s are" : " is"} overdue.`,
      severity: "danger",
    });
  }

  // 4. Busiest day of the week (computed in IST)
  const dayScores = new Array(7).fill(0) as number[];
  for (const task of pending) {
    if (!task.dueDate) continue;
    // Use IST day-of-week: parse the IST date key and get its weekday
    const istKey = localDateKey(new Date(task.dueDate)); // "YYYY-MM-DD" in IST
    const [y, m, d] = istKey.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat, local midnight
    dayScores[dow] += PRIORITY_WEIGHT[task.priority] ?? 1;
  }
  const maxScore = Math.max(...dayScores);
  if (maxScore > 0) {
    const busiestIdx = dayScores.indexOf(maxScore);
    insights.push({
      id: "busiest-day",
      icon: "calendar",
      text: `${DAY_NAMES[busiestIdx]} is your busiest day this week.`,
      severity: "neutral",
    });
  }

  // 5. Free days
  const freeDays = dayScores
    .map((s, i) => (s === 0 ? DAY_NAMES[i] : null))
    .filter(Boolean) as string[];
  if (freeDays.length > 0 && freeDays.length <= 3) {
    const label = freeDays.length === 1
      ? `${freeDays[0]} has no tasks scheduled.`
      : `${freeDays.slice(0, -1).join(", ")} and ${freeDays[freeDays.length - 1]} have no tasks scheduled.`;
    insights.push({
      id: "free-days",
      icon: "info",
      text: label,
      severity: "neutral",
    });
  }

  // 6. Completion rate
  const total = tasks.length;
  if (total >= 5) {
    const rate = Math.round((completed.length / total) * 100);
    insights.push({
      id: "completion-rate",
      icon: "check",
      text: `You've completed ${rate}% of all tasks (${completed.length}/${total}).`,
      severity: rate >= 70 ? "success" : "neutral",
    });
  }

  // 7. High-priority overdue
  const highOverdue = overdue.filter((t) => t.priority === "HIGH");
  if (highOverdue.length > 0) {
    insights.push({
      id: "high-overdue",
      icon: "fire",
      text: `${highOverdue.length} HIGH-priority task${highOverdue.length !== 1 ? "s are" : " is"} overdue.`,
      severity: "danger",
    });
  }

  return insights;
}
