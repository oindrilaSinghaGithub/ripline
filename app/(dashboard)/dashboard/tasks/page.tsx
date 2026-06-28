import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TaskList } from "@/components/tasks/task-list";

export const metadata: Metadata = {
  title: "Tasks",
};

export default async function TasksPage() {
  const session = await auth();

  const tasks = await db.task.findMany({
    where: {
      userId: session!.user.id,
      // For recurring tasks: only show if nextOccurrence is set (series still active)
      // For non-recurring: show all
      OR: [
        { recurrenceRule: null },
        { recurrenceRule: { not: null }, nextOccurrence: { not: null } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and track all your tasks in one place.
        </p>
      </div>

      <TaskList initialTasks={tasks} />
    </div>
  );
}
