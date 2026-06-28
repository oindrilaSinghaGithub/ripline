"use client";

import * as React from "react";
import type { Task } from "@prisma/client";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, Calendar, AlertCircle, RefreshCw } from "lucide-react";

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

import { formatInIST } from "@/lib/tz";

function formatDue(date: Date | null): string | null {
  if (!date) return null;
  return formatInIST(new Date(date), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const [toggling, setToggling] = React.useState(false);
  const isCompleted = task.status === "COMPLETED";
  const isRecurring = !!task.recurrenceRule;

  // For recurring tasks, show nextOccurrence as the active due date.
  // For regular tasks, show dueDate.
  const activeDueDate = isRecurring
    ? (task.nextOccurrence ?? task.dueDate)
    : task.dueDate;

  const isOverdue =
    !isCompleted && activeDueDate != null && new Date(activeDueDate) < new Date();

  async function handleToggle() {
    setToggling(true);
    try {
      await toggleTaskComplete(task.id);
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card
      className={cn(
        "transition-opacity",
        isCompleted && "opacity-60"
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleToggle}
          disabled={toggling}
          aria-label={
            isRecurring
              ? "Mark this occurrence complete and advance to next"
              : isCompleted ? "Mark pending" : "Mark complete"
          }
          className="mt-0.5 shrink-0"
        />

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              isCompleted && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>

          {task.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* Priority */}
            <Badge
              variant="outline"
              className={cn("text-xs", PRIORITY_STYLES[task.priority as keyof typeof PRIORITY_STYLES])}
            >
              {task.priority}
            </Badge>

            {/* Category */}
            <Badge variant="secondary" className="text-xs">
              {CATEGORY_LABELS[task.category] ?? task.category}
            </Badge>

            {/* Recurring indicator */}
            {isRecurring && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Recurring task">
                <RefreshCw className="h-3 w-3" />
                Recurring
              </span>
            )}

            {/* Due date — nextOccurrence for recurring, dueDate for regular */}
            {activeDueDate && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  isOverdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {isOverdue ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <Calendar className="h-3 w-3" />
                )}
                {formatDue(new Date(activeDueDate))}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onEdit(task)}
            aria-label="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(task)}
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
