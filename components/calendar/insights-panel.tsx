"use client";

import * as React from "react";
import {
  Clock,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/calendar-utils";

const ICON_MAP: Record<Insight["icon"], React.ElementType> = {
  clock: Clock,
  fire: Flame,
  alert: AlertTriangle,
  check: CheckCircle2,
  calendar: Calendar,
  info: Info,
};

const SEVERITY_STYLES: Record<Insight["severity"], string> = {
  neutral: "border-border bg-muted/30 text-foreground",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  danger: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  success: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
};

const ICON_SEVERITY_STYLES: Record<Insight["severity"], string> = {
  neutral: "text-muted-foreground",
  warning: "text-yellow-600 dark:text-yellow-400",
  danger: "text-red-600 dark:text-red-400",
  success: "text-green-600 dark:text-green-400",
};

interface InsightsPanelProps {
  insights: Insight[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const [expanded, setExpanded] = React.useState(true);

  const dangerCount = insights.filter((i) => i.severity === "danger").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;

  return (
    <div className="rounded-xl border bg-card shadow">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 text-sm font-semibold">AI Insights</span>

        {/* Summary badges when collapsed */}
        {!expanded && (
          <div className="flex items-center gap-1.5">
            {dangerCount > 0 && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                {dangerCount} urgent
              </span>
            )}
            {warningCount > 0 && (
              <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                {warningCount} warning{warningCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Insights grid */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((insight) => {
              const Icon = ICON_MAP[insight.icon];
              return (
                <div
                  key={insight.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                    SEVERITY_STYLES[insight.severity]
                  )}
                  role="status"
                  aria-label={insight.text}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      ICON_SEVERITY_STYLES[insight.severity]
                    )}
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-snug">{insight.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
