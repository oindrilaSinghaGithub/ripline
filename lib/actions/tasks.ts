"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CreateTaskInput, UpdateTaskInput } from "@/types";
import { nextOccurrenceAfter } from "@/lib/recurrence";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput) {
  const userId = await requireUser();

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;

  // For recurring tasks, nextOccurrence starts at dueDate (the first occurrence).
  const nextOccurrence =
    input.recurrenceRule && dueDate ? dueDate : null;

  const task = await db.task.create({
    data: {
      userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      dueDate,
      priority: input.priority ?? "MEDIUM",
      category: input.category ?? "OTHER",
      recurrenceRule: input.recurrenceRule || null,
      nextOccurrence,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  return task;
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const userId = await requireUser();

  const existing = await db.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");

  // Resolve the new recurrenceRule and dueDate (may be changing)
  const newRecurrenceRule =
    input.recurrenceRule !== undefined ? input.recurrenceRule || null : existing.recurrenceRule;
  const newDueDate =
    input.dueDate !== undefined
      ? input.dueDate ? new Date(input.dueDate) : null
      : existing.dueDate;

  // If the recurrenceRule or dueDate changed, reset nextOccurrence to the new dueDate
  const recurrenceChanged =
    input.recurrenceRule !== undefined || input.dueDate !== undefined;
  const newNextOccurrence = recurrenceChanged
    ? newRecurrenceRule && newDueDate ? newDueDate : null
    : undefined; // undefined = don't touch

  const task = await db.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.dueDate !== undefined
        ? { dueDate: newDueDate }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.recurrenceRule !== undefined
        ? { recurrenceRule: input.recurrenceRule || null }
        : {}),
      ...(newNextOccurrence !== undefined
        ? { nextOccurrence: newNextOccurrence }
        : {}),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  return task;
}

export async function deleteTask(id: string) {
  const userId = await requireUser();

  const existing = await db.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");

  await db.task.delete({ where: { id } });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function toggleTaskComplete(id: string) {
  const userId = await requireUser();

  const existing = await db.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");

  // ── Recurring task: advance to next occurrence instead of toggling status ──
  if (existing.recurrenceRule) {
    // The occurrence being completed is nextOccurrence (or dueDate as fallback)
    const completedDate = existing.nextOccurrence ?? existing.dueDate;

    if (completedDate) {
      const next = nextOccurrenceAfter(existing.recurrenceRule, new Date(completedDate));

      const task = await db.task.update({
        where: { id },
        data: {
          // Advance the pointer; keep status PENDING so the task stays active
          nextOccurrence: next ?? null,
          lastCompletedOccurrence: completedDate,
        },
      });

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/tasks");
      return task;
    }
  }

  // ── Non-recurring task: standard toggle ───────────────────────────────────
  const task = await db.task.update({
    where: { id },
    data: { status: existing.status === "COMPLETED" ? "PENDING" : "COMPLETED" },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  return task;
}

/**
 * Toggle completion for a single calendar occurrence of a recurring task.
 *
 * This is the calendar-specific completion path. It does NOT advance
 * nextOccurrence or change task.status — those remain the responsibility
 * of the Tasks page (toggleTaskComplete above).
 *
 * The `occurrenceDateKey` ("YYYY-MM-DD") is resolved to noon UTC for storage
 * so it round-trips cleanly. The calendar expander checks completedOccurrences
 * to set `status` on each virtual instance independently.
 *
 * `rawTaskId` must be the real DB task id (not the composite `${id}_${dateKey}`
 * used as React keys on calendar instances).
 */
export async function toggleOccurrenceComplete(
  rawTaskId: string,
  occurrenceDateKey: string, // "YYYY-MM-DD"
) {
  const userId = await requireUser();

  const existing = await db.task.findFirst({ where: { id: rawTaskId, userId } });
  if (!existing) throw new Error("Task not found");
  if (!existing.recurrenceRule) throw new Error("Not a recurring task");

  // Represent the occurrence as noon UTC on that date for stable storage
  const [y, m, d] = occurrenceDateKey.split("-").map(Number);
  const occurrenceTs = new Date(Date.UTC(y, m - 1, d, 6, 30, 0)); // 06:30 UTC = noon IST

  // Check if already completed (match by date, ignoring time precision)
  const alreadyCompleted = existing.completedOccurrences.some((ts) => {
    const k = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}-${String(ts.getUTCDate()).padStart(2, "0")}`;
    return k === occurrenceDateKey;
  });

  const task = await db.task.update({
    where: { id: rawTaskId },
    data: {
      completedOccurrences: alreadyCompleted
        // Remove this date (un-complete)
        ? {
            set: existing.completedOccurrences.filter((ts) => {
              const k = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}-${String(ts.getUTCDate()).padStart(2, "0")}`;
              return k !== occurrenceDateKey;
            }),
          }
        // Add this date (complete)
        : { push: occurrenceTs },
    },
  });

  revalidatePath("/dashboard/calendar");
  return task;
}

export async function getTaskStats(userId: string) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [pending, completed, upcoming, overdue] = await Promise.all([
    // Pending: non-recurring PENDING + recurring with active nextOccurrence
    db.task.count({
      where: {
        userId,
        OR: [
          { recurrenceRule: null, status: "PENDING" },
          { recurrenceRule: { not: null }, nextOccurrence: { not: null } },
        ],
      },
    }),
    // Completed: non-recurring COMPLETED only (recurring tracks history separately)
    db.task.count({ where: { userId, recurrenceRule: null, status: "COMPLETED" } }),
    // Upcoming: due within 7 days
    db.task.count({
      where: {
        userId,
        OR: [
          {
            recurrenceRule: null,
            status: "PENDING",
            dueDate: { gte: now, lte: weekAhead },
          },
          {
            recurrenceRule: { not: null },
            nextOccurrence: { gte: now, lte: weekAhead },
          },
        ],
      },
    }),
    // Overdue: past due
    db.task.count({
      where: {
        userId,
        OR: [
          { recurrenceRule: null, status: "PENDING", dueDate: { lt: now } },
          { recurrenceRule: { not: null }, nextOccurrence: { lt: now } },
        ],
      },
    }),
  ]);

  return { pending, completed, upcoming, overdue };
}
