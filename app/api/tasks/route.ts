import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse, TaskWithReminders } from "@/types";

// GET /api/tasks — list all tasks for the current user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") as "PENDING" | "COMPLETED" | null;
  const category = searchParams.get("category") as string | null;

  const tasks = await db.task.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
      ...(category ? { category: category as never } : {}),
    },
    include: { reminders: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json<ApiResponse<TaskWithReminders[]>>({ success: true, data: tasks });
}

// POST /api/tasks — create a task
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, dueDate, priority, category, recurrenceRule } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Title is required" }, { status: 400 });
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  const nextOccurrence = recurrenceRule && parsedDueDate ? parsedDueDate : null;

  const task = await db.task.create({
    data: {
      userId: session.user.id,
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: parsedDueDate,
      priority: priority ?? "MEDIUM",
      category: category ?? "OTHER",
      recurrenceRule: recurrenceRule || null,
      nextOccurrence,
    },
    include: { reminders: true },
  });

  return NextResponse.json<ApiResponse<TaskWithReminders>>({ success: true, data: task }, { status: 201 });
}
