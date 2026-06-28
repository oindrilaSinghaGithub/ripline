"use client";

import * as React from "react";
import type { Task } from "@prisma/client";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskDetailPanel } from "./task-detail-panel";
import {
  buildMonthGrid,
  buildWeekGrid,
  groupTasksByDay,
  monthDateKeys,
  weekDateKeys,
  type CalendarWeek,
} from "@/lib/calendar-utils";
import { expandRecurringTasks } from "@/lib/recurrence";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WORKLOAD_STYLES = {
  none: "",
  low: "bg-green-500/10 dark:bg-green-500/15",
  medium: "bg-yellow-500/15 dark:bg-yellow-500/20",
  high: "bg-red-500/15 dark:bg-red-500/20",
} as const;

const WORKLOAD_DOT = {
  none: "",
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
} as const;

const PRIORITY_EVENT_STYLES = {
  HIGH: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface CalendarGridProps {
  tasks: Task[];
}

type ViewMode = "month" | "week";

export function CalendarGrid({ tasks }: CalendarGridProps) {
  const today = new Date();
  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth());
  const [anchor, setAnchor] = React.useState(today); // for week view
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const tasksByDay = React.useMemo(() => groupTasksByDay(tasks), [tasks]);

  // ── Single expansion pass ──────────────────────────────────────────────────
  // Compute the union of date keys for both views, expand recurring tasks
  // exactly once, then hand the resulting map to both grid builders.
  // This is the sole call to expandRecurringTasks per render cycle.
  const recurringByDay = React.useMemo(() => {
    const monthKeys = monthDateKeys(year, month);
    const wkKeys = weekDateKeys(anchor);
    // Union: month keys + any week keys not already covered (e.g. week view
    // spans a different month than the month view)
    const allKeys = Array.from(new Set([...monthKeys, ...wkKeys]));
    return expandRecurringTasks(tasks, allKeys);
  }, [tasks, year, month, anchor]);

  const monthGrid = React.useMemo(
    () => buildMonthGrid(year, month, tasksByDay, recurringByDay),
    [year, month, tasksByDay, recurringByDay]
  );

  const weekGrid = React.useMemo(
    () => buildWeekGrid(anchor, tasksByDay, recurringByDay),
    [anchor, tasksByDay, recurringByDay]
  );

  const selectedTasks = React.useMemo(() => {
    if (!selectedDate) return [];
    // Search in the currently rendered grid (already has recurring instances merged in)
    const currentGrid = viewMode === "month" ? monthGrid : [weekGrid];
    for (const week of currentGrid) {
      for (const cell of week) {
        if (cell.dateKey === selectedDate) return cell.workload.tasks;
      }
    }
    return [];
  }, [selectedDate, viewMode, monthGrid, weekGrid]);

  // ─── Navigation ────────────────────────────────────────────────────────────
  function prevPeriod() {
    if (viewMode === "month") {
      if (month === 0) { setYear((y) => y - 1); setMonth(11); }
      else setMonth((m) => m - 1);
    } else {
      const d = new Date(anchor);
      d.setDate(d.getDate() - 7);
      setAnchor(d);
    }
  }

  function nextPeriod() {
    if (viewMode === "month") {
      if (month === 11) { setYear((y) => y + 1); setMonth(0); }
      else setMonth((m) => m + 1);
    } else {
      const d = new Date(anchor);
      d.setDate(d.getDate() + 7);
      setAnchor(d);
    }
  }

  function goToToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setAnchor(now);
  }

  function handleDayClick(dateKey: string) {
    setSelectedDate((prev) => (prev === dateKey ? null : dateKey));
  }

  // Period label
  const periodLabel =
    viewMode === "month"
      ? `${MONTH_NAMES[month]} ${year}`
      : (() => {
          const week = weekGrid;
          const first = week[0].date;
          const last = week[6].date;
          if (first.getMonth() === last.getMonth()) {
            return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
          }
          return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
        })();

  const grid = viewMode === "month" ? monthGrid : [weekGrid];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View toggle */}
        <div className="flex rounded-lg border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === "month"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={viewMode === "month"}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Month
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === "week"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={viewMode === "week"}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Week
          </button>
        </div>

        {/* Navigation */}
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={prevPeriod} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={nextPeriod} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[180px]">{periodLabel}</span>
        <Button size="sm" variant="outline" className="h-8 ml-auto" onClick={goToToday}>
          Today
        </Button>
      </div>

      <div className={cn("grid gap-4", selectedDate ? "lg:grid-cols-[1fr_300px]" : "")}>
        {/* Calendar */}
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b">
            {DOW_LABELS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-semibold text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((cell) => {
                const dayNum = cell.date.getDate();
                const isSelected = selectedDate === cell.dateKey;
                const hasTasks = cell.workload.tasks.length > 0;
                const level = cell.workload.level;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => handleDayClick(cell.dateKey)}
                    aria-label={`${cell.dateKey}${hasTasks ? `, ${cell.workload.tasks.length} tasks` : ""}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative min-h-[80px] border-r p-1.5 text-left transition-colors last:border-r-0",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      !cell.isCurrentMonth && "opacity-40",
                      WORKLOAD_STYLES[level],
                      isSelected && "ring-2 ring-inset ring-primary",
                      "hover:bg-accent/50"
                    )}
                  >
                    {/* Date number */}
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        cell.isToday
                          ? "bg-primary text-primary-foreground font-bold"
                          : "text-foreground"
                      )}
                    >
                      {dayNum}
                    </span>

                    {/* Workload dot */}
                    {level !== "none" && (
                      <span
                        className={cn(
                          "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
                          WORKLOAD_DOT[level]
                        )}
                        aria-hidden="true"
                      />
                    )}

                    {/* Task event pills — show up to 2 in month view, all in week view */}
                    <div className="mt-1 space-y-0.5">
                      {cell.workload.tasks
                        .slice(0, viewMode === "week" ? 10 : 2)
                        .map((task) => (
                          <div
                            key={task.id}
                            className={cn(
                              "truncate rounded border px-1 py-0.5 text-[10px] font-medium leading-tight",
                              PRIORITY_EVENT_STYLES[task.priority as keyof typeof PRIORITY_EVENT_STYLES],
                              task.status === "COMPLETED" && "line-through opacity-60"
                            )}
                          >
                            {task.title}
                          </div>
                        ))}
                      {viewMode === "month" && cell.workload.tasks.length > 2 && (
                        <div className="px-1 text-[10px] text-muted-foreground">
                          +{cell.workload.tasks.length - 2} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <TaskDetailPanel
            tasks={selectedTasks}
            selectedDate={selectedDate}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </div>

      {/* Workload legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Workload:</span>
        {(
          [
            { level: "none", label: "None", dot: "bg-muted-foreground/40" },
            { level: "low", label: "Low", dot: "bg-green-500" },
            { level: "medium", label: "Medium", dot: "bg-yellow-500" },
            { level: "high", label: "High", dot: "bg-red-500" },
          ] as const
        ).map(({ level, label, dot }) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2.5 w-2.5 rounded-full", dot)} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Click any day to see tasks
        </span>
      </div>
    </div>
  );
}
