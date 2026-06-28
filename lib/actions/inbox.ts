"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TaskSuggestion } from "@/lib/ai/types";
import type { SourceType } from "@prisma/client";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * Persist a source record (text / image / pdf).
 * Returns the created Source id so the client can reference it.
 */
export async function saveSource(input: {
  sourceType: SourceType;
  originalContent: string;
}) {
  const userId = await requireUser();

  const source = await db.source.create({
    data: {
      userId,
      sourceType: input.sourceType,
      originalContent: input.originalContent,
    },
  });

  revalidatePath("/dashboard/inbox");
  return source;
}

/**
 * Confirm a batch of user-reviewed suggestions and persist them as Tasks.
 * Each confirmed suggestion is linked back to the source it came from.
 */
export async function confirmSuggestions(
  sourceId: string,
  suggestions: TaskSuggestion[]
) {
  const userId = await requireUser();

  // Verify source ownership
  const source = await db.source.findFirst({ where: { id: sourceId, userId } });
  if (!source) throw new Error("Source not found");

  if (suggestions.length === 0) return [];

  const tasks = await Promise.all(
    suggestions.map((s) => {
      const dueDate = s.dueDate ? new Date(s.dueDate) : null;
      const nextOccurrence = s.recurrenceRule && dueDate ? dueDate : null;

      return db.task.create({
        data: {
          userId,
          sourceId,
          title: s.title.trim(),
          description: s.description?.trim() || null,
          dueDate,
          priority: s.priority,
          category: s.category,
          recurrenceRule: s.recurrenceRule || null,
          nextOccurrence,
          status: "PENDING",
        },
      });
    })
  );

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/inbox");

  return tasks;
}

/**
 * Fetch the user's source history, most recent first.
 */
export async function getSourceHistory(limit = 20) {
  const userId = await requireUser();

  return db.source.findMany({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    take: limit,
    include: {
      _count: { select: { tasks: true } },
    },
  });
}
