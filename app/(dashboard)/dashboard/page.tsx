import type { Task } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTaskStats } from "@/lib/actions/tasks";
import { db } from "@/lib/db";
import { computeInsights } from "@/lib/calendar-utils";
import { InsightsPanel } from "@/components/calendar/insights-panel";
import { AskRipline } from "@/components/schedule/ask-ripline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInIST } from "@/lib/tz";

export const metadata: Metadata = {
  title: "Dashboard",
};

function formatDue(date: Date): string {
  return formatInIST(date, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PRIORITY_STYLES = {
  LOW: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  MEDIUM: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  HIGH: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
} as const;

export default async function DashboardPage() {
  const session = await auth();

  // ✅ FIX: prevent crash loop
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  const [stats, recentTasks, allTasks] = await Promise.all([
    getTaskStats(userId),
    db.task.findMany({
      where: {
        userId,
        status: "PENDING",
        // For recurring tasks, only show if there's a next occurrence
        OR: [
          { recurrenceRule: null },
          { recurrenceRule: { not: null }, nextOccurrence: { not: null } } as never,
        ],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    db.task.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
  ]);

  const insights = computeInsights(allTasks);

  const statCards = [
    {
      title: "Pending",
      value: stats.pending,
      description: "Tasks to complete",
      icon: Clock,
      className: "",
    },
    {
      title: "Completed",
      value: stats.completed,
      description: "Tasks finished",
      icon: CheckCircle2,
      className: "text-green-600 dark:text-green-400",
    },
    {
      title: "Due this week",
      value: stats.upcoming,
      description: "Upcoming deadlines",
      icon: CalendarClock,
      className: "text-yellow-600 dark:text-yellow-400",
    },
    {
      title: "Overdue",
      value: stats.overdue,
      description: "Past due date",
      icon: AlertTriangle,
      className: stats.overdue > 0 ? "text-destructive" : "",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Good to see you, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s a snapshot of your tasks.
          </p>
        </div>
        <Badge variant="secondary">Beta</Badge>
      </div>

      {/* AI Insights */}
      <InsightsPanel insights={insights} />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={cn("h-4 w-4 text-muted-foreground", stat.className)} />
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", stat.className)}>
                {stat.value}
              </p>
              <CardDescription className="mt-1 text-xs">
                {stat.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ask Ripline */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Ask Ripline</CardTitle>
          </div>
          <CardDescription>
            Schedule tasks with natural language. Never saved without your review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AskRipline />
        </CardContent>
      </Card>

      {/* Recent tasks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Upcoming tasks</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/tasks">
              View all
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {recentTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-semibold">No pending tasks</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                You&apos;re all caught up! Head to tasks to create new ones.
              </p>
              <Button size="sm" className="mt-4" asChild>
                <Link href="/dashboard/tasks">Go to tasks</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
          {recentTasks.map((task: Task) => {
                const isOverdue =
                task.dueDate != null && new Date(task.dueDate) < new Date();

              return (
                <Card key={task.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {task.title}
                      </p>
                      {task.dueDate && (
                        <p
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-xs",
                            isOverdue
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {isOverdue ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CalendarClock className="h-3 w-3" />
                          )}
                          {formatDue(task.dueDate)}
                        </p>
                      )}
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-xs",
                        PRIORITY_STYLES[
                          task.priority as keyof typeof PRIORITY_STYLES
                        ]
                      )}
                    >
                      {task.priority}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
// export default async function DashboardPage() {
//   return (
//     <div className="p-8">
//       <h1 className="text-2xl font-bold">Dashboard works 🎉</h1>
//     </div>
//   );
// }