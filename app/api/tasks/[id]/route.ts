import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse, TaskWithReminders } from "@/types";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/tasks/:id
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await db.task.findFirst({
    where: { id, userId: session.user.id },
    include: { reminders: true },
  });

  if (!task) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json<ApiResponse<TaskWithReminders>>({ success: true, data: task });
}

// PATCH /api/tasks/:id — update task fields or mark complete
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Task not found" }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, dueDate, priority, category, status, recurrenceRule } = body;

  const task = await db.task.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(recurrenceRule !== undefined ? { recurrenceRule: recurrenceRule || null } : {}),
    },
    include: { reminders: true },
  });

  return NextResponse.json<ApiResponse<TaskWithReminders>>({ success: true, data: task });
}

// DELETE /api/tasks/:id
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Task not found" }, { status: 404 });
  }

  await db.task.delete({ where: { id } });

  return NextResponse.json<ApiResponse<{ id: string }>>({ success: true, data: { id } });
}
