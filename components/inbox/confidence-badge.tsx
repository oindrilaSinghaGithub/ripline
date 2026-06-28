/**
 * ConfidenceBadge
 *
 * Derives a human-readable confidence level from a TaskSuggestion using only
 * existing backend fields — no new API calls or schema changes.
 *
 * Derivation rules (when confidenceScore exists it drives colour; the label
 * layer also incorporates needsReview / validationErrors so the badge
 * communicates validation state, not just a raw number):
 *
 *   needsReview = true              → Low   (yellow/red)
 *   validationErrors.length > 0     → Medium (yellow)
 *   confidenceScore >= 0.75         → High  (green)
 *   confidenceScore >= 0.5          → Medium (yellow)
 *   else                            → Low   (red)
 */

"use client";

import { cn } from "@/lib/utils";
import type { TaskSuggestion } from "@/lib/ai/types";

export type ConfidenceLevel = "high" | "medium" | "low";

export function deriveConfidenceLevel(s: TaskSuggestion): ConfidenceLevel {
  if (s.needsReview) return "low";
  if (s.validationErrors.length > 0) return "medium";
  if (s.confidenceScore >= 0.75) return "high";
  if (s.confidenceScore >= 0.5) return "medium";
  return "low";
}

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
  high:   "border-green-500/40  bg-green-500/10  text-green-700  dark:text-green-400",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  low:    "border-red-500/40    bg-red-500/10    text-red-600    dark:text-red-400",
};

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high:   "High confidence",
  medium: "Medium confidence",
  low:    "Low confidence",
};

interface ConfidenceBadgeProps {
  suggestion: TaskSuggestion;
  className?: string;
  /** Show the raw percentage next to the label */
  showScore?: boolean;
}

export function ConfidenceBadge({
  suggestion,
  className,
  showScore = true,
}: ConfidenceBadgeProps) {
  const level = deriveConfidenceLevel(suggestion);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
        LEVEL_STYLES[level],
        className,
      )}
      title={`Confidence score: ${Math.round(suggestion.confidenceScore * 100)}%`}
    >
      {LEVEL_LABELS[level]}
      {showScore && (
        <span className="opacity-70">
          · {Math.round(suggestion.confidenceScore * 100)}%
        </span>
      )}
    </span>
  );
}
