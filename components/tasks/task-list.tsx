"use client";

import * as React from "react";
import type { Task } from "@prisma/client";
import { TaskCard } from "./task-card";
import { TaskFormModal } from "./task-form-modal";
import { DeleteTaskDialog } from "./delete-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ClipboardList, Search } from "lucide-react";

interface TaskListProps {
  initialTasks: Task[];
}

type FilterStatus = "ALL" | "PENDING" | "COMPLETED";
type FilterPriority = "ALL" | "LOW" | "MEDIUM" | "HIGH";

export function TaskList({ initialTasks }: TaskListProps) {
  const [tasks] = React.useState<Task[]>(initialTasks);
  const [search, setSearch] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<FilterStatus>("ALL");
  const [filterPriority, setFilterPriority] = React.useState<FilterPriority>("ALL");

  // Create modal
  const [createOpen, setCreateOpen] = React.useState(false);

  // Edit modal
  const [editTask, setEditTask] = React.useState<Task | null>(null);

  // Delete dialog
  const [deleteTask, setDeleteTask] = React.useState<Task | null>(null);

  const filtered = tasks
    .filter((t) => {
      const matchesSearch =
        search.trim() === "" ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(search.toLowerCase());

      // For status filter: recurring tasks are always PENDING, but treat them
      // as "has completions" for the COMPLETED filter view.
      let matchesStatus: boolean;
      if (filterStatus === "ALL") {
        matchesStatus = true;
      } else if (filterStatus === "COMPLETED") {
        matchesStatus =
          t.status === "COMPLETED" ||
          (!!t.recurrenceRule && t.lastCompletedOccurrence !== null);
      } else {
        // PENDING: show non-recurring pending tasks + all active recurring tasks
        matchesStatus =
          t.status === "PENDING" ||
          (!!t.recurrenceRule && !!t.nextOccurrence);
      }

      const matchesPriority = filterPriority === "ALL" || t.priority === filterPriority;
      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => {
      // Sort by the effective due date: nextOccurrence for recurring, dueDate for regular
      const aDate = a.recurrenceRule ? a.nextOccurrence : a.dueDate;
      const bDate = b.recurrenceRule ? b.nextOccurrence : b.dueDate;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterPriority}
          onValueChange={(v) => setFilterPriority(v as FilterPriority)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priority</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New task
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-base font-semibold">
            {tasks.length === 0 ? "No tasks yet" : "No matching tasks"}
          </h3>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {tasks.length === 0
              ? "Create your first task to get started."
              : "Try adjusting your filters."}
          </p>
          {tasks.length === 0 && (
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create task
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={(t) => setEditTask(t)}
              onDelete={(t) => setDeleteTask(t)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <TaskFormModal open={createOpen} onOpenChange={setCreateOpen} />
      <TaskFormModal open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)} task={editTask} />
      <DeleteTaskDialog
        open={!!deleteTask}
        onOpenChange={(o) => !o && setDeleteTask(null)}
        task={deleteTask}
      />
    </>
  );
}
