import type { User, Workspace, WorkspaceMember, Task, Reminder } from "@prisma/client";

// ─── Session ────────────────────────────────────────────────────────────────

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

// ─── Workspace ──────────────────────────────────────────────────────────────

export type WorkspaceWithMembers = Workspace & {
  members: (WorkspaceMember & { user: User })[];
};

export type WorkspaceWithOwner = Workspace & {
  owner: User;
};

// ─── API responses ──────────────────────────────────────────────────────────

export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Tasks ──────────────────────────────────────────────────────────────────

export type TaskWithReminders = Task & {
  reminders: Reminder[];
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  dueDate?: string; // ISO string from form
  priority: "LOW" | "MEDIUM" | "HIGH";
  category: "ACADEMIC" | "WORK" | "PERSONAL" | "OTHER";
  recurrenceRule?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: "PENDING" | "COMPLETED";
};
