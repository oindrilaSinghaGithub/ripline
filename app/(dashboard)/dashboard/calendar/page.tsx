import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { InsightsPanel } from "@/components/calendar/insights-panel";
import { AskRipline } from "@/components/schedule/ask-ripline";
import { computeInsights } from "@/lib/calendar-utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Fetch all tasks — calendar shows them all, insights computed server-side
  const tasks = await db.task.findMany({
    where: { userId },
    orderBy: { dueDate: "asc" },
  });

  const insights = computeInsights(tasks);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your schedule, workload, and deadlines at a glance.
        </p>
      </div>

      {/* AI Insights */}
      <InsightsPanel insights={insights} />

      {/* Ask Ripline NL scheduling */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Ask Ripline</CardTitle>
          </div>
          <CardDescription>
            Describe what you want to schedule in plain English. Review before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AskRipline />
        </CardContent>
      </Card>

      {/* Calendar */}
      <CalendarGrid tasks={tasks} />
    </div>
  );
}
