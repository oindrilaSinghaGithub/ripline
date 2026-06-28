"use client";

import * as React from "react";
import type { Task } from "@prisma/client";
import {
  X,
  Calendar,
  Tag,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTaskComplete, toggleOccurrenceComplete } from "@/lib/actions/tasks";
import { formatInIST, dateKeyToLabel } from "@/lib/tz";

const PRIORITY_STYLES = {
  LOW: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  MEDIUM: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  HIGH: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  ACADEMIC: "Academic",
  WORK: "Work",
  PERSONAL: "Personal",
  OTHER: "Other",
};

function formatDateTime(d: Date): string {
  return formatInIST(d, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TaskDetailPanelProps {
  tasks: Task[];
  selectedDate: string; // "YYYY-MM-DD"
  onClose: () => void;
}

export function TaskDetailPanel({ tasks, selectedDate, onClose }: TaskDetailPanelProps) {
  const [localTasks, setLocalTasks] = React.useState<Task[]>(tasks);

  React.useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const dateLabel = dateKeyToLabel(selectedDate);

  async function handleToggle(task: Task) {
    const isRecurring = !!task.recurrenceRule;

    // Optimistic flip
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: t.status === "COMPLETED" ? "PENDING" : "COMPLETED" }
          : t
      )
    );

    try {
      if (isRecurring) {
        // task.id on a calendar instance is "${realId}_${dateKey}" — split it apart.
        // The dateKey portion is everything after the last underscore-separated YYYY-MM-DD.
        const match = task.id.match(/^(.+)_(\d{4}-\d{2}-\d{2})$/);
        if (!match) throw new Error("Unexpected instance id format");
        const [, realId, dateKey] = match;
        await toggleOccurrenceComplete(realId, dateKey);
      } else {
        await toggleTaskComplete(task.id);
      }
    } catch {
      // Revert optimistic update on failure
      setLocalTasks(tasks);
    }
  }

  return (
    <aside
      className="flex flex-col rounded-xl border bg-card shadow-lg"
      aria-label={`Tasks for ${dateLabel}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{dateLabel}</h3>
          <p className="text-xs text-muted-foreground">
            {localTasks.length} {localTasks.length === 1 ? "task" : "tasks"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {localTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No tasks on this day</p>
          </div>
        ) : (
          localTasks.map((task) => {
            const isCompleted = task.status === "COMPLETED";
            const isOverdue =
              !isCompleted && task.dueDate != null && new Date(task.dueDate) < new Date();

            return (
              <div
                key={task.id}
                className={cn(
                  "rounded-lg border bg-background p-3 space-y-2 transition-opacity",
                  isCompleted && "opacity-60"
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggle(task)}
                    aria-label={isCompleted ? "Mark pending" : "Mark complete"}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium leading-snug",
                        isCompleted && "line-through text-muted-foreground"
                      )}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", PRIORITY_STYLES[task.priority as keyof typeof PRIORITY_STYLES])}
                  >
                    {task.priority}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <Tag className="mr-1 h-2.5 w-2.5" />
                    {CATEGORY_LABELS[task.category] ?? task.category}
                  </Badge>
                </div>

                {task.dueDate && (
                  <p
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      isOverdue ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {isOverdue ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Calendar className="h-3 w-3" />
                    )}
                    {formatDateTime(task.dueDate)}
                  </p>
                )}

                {task.recurrenceRule && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    {task.recurrenceRule}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
