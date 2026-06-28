"use client";

import * as React from "react";
import {
  Check,
  Pencil,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  Quote,
  Bell,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceBadge } from "./confidence-badge";
import { SourceIconButton, SourcePreviewModal } from "./source-preview-modal";
import type { TaskSuggestion, SourceMimeType } from "@/lib/ai/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  LOW:    "border-green-500/40  bg-green-500/10  text-green-700  dark:text-green-400",
  MEDIUM: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  HIGH:   "border-red-500/40    bg-red-500/10    text-red-700    dark:text-red-400",
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  ACADEMIC: "Academic",
  WORK:     "Work",
  PERSONAL: "Personal",
  OTHER:    "Other",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

/** "-PT30M" → "30m before", "-P1D" → "1d before" */
function formatReminderOffset(offset: string): string {
  const m = offset.match(/^-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return offset;
  const [, days, hours, mins] = m;
  const parts: string[] = [];
  if (days)  parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins)  parts.push(`${mins}m`);
  return parts.length ? `${parts.join(" ")} before` : offset;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionState = "pending" | "confirmed" | "discarded";

export interface SuggestionCardProps {
  suggestion: TaskSuggestion;
  state: SuggestionState;
  /** The raw input text that produced this batch — used by the source preview */
  rawText: string;
  mimeType: SourceMimeType;
  onConfirm: (suggestion: TaskSuggestion) => void;
  onDiscard: (id: string) => void;
  onUpdate: (suggestion: TaskSuggestion) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestionCard({
  suggestion,
  state,
  rawText,
  mimeType,
  onConfirm,
  onDiscard,
  onUpdate,
}: SuggestionCardProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [showSnippet, setShowSnippet] = React.useState(false);
  const [showSourcePreview, setShowSourcePreview] = React.useState(false);

  // Edit form state — synced from suggestion when entering edit mode
  const [title, setTitle] = React.useState(suggestion.title);
  const [description, setDescription] = React.useState(suggestion.description ?? "");
  const [dueDate, setDueDate] = React.useState(toDateInputValue(suggestion.dueDate));
  const [priority, setPriority] = React.useState(suggestion.priority);
  const [category, setCategory] = React.useState(suggestion.category);

  // Re-sync edit state if suggestion is updated externally
  React.useEffect(() => {
    if (!isEditing) {
      setTitle(suggestion.title);
      setDescription(suggestion.description ?? "");
      setDueDate(toDateInputValue(suggestion.dueDate));
      setPriority(suggestion.priority);
      setCategory(suggestion.category);
    }
  }, [suggestion, isEditing]);

  function saveEdits() {
    if (!title.trim()) return;
    onUpdate({
      ...suggestion,
      title: title.trim(),
      description: description.trim() || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      priority,
      category,
      // User reviewed and edited — clear validation flags
      needsReview: false,
      validationErrors: [],
    });
    setIsEditing(false);
    setShowErrors(false);
  }

  function cancelEdits() {
    setTitle(suggestion.title);
    setDescription(suggestion.description ?? "");
    setDueDate(toDateInputValue(suggestion.dueDate));
    setPriority(suggestion.priority);
    setCategory(suggestion.category);
    setIsEditing(false);
  }

  const isDiscarded = state === "discarded";
  const isConfirmed = state === "confirmed";
  const hasErrors = suggestion.needsReview && suggestion.validationErrors.length > 0;
  const errorCount = suggestion.validationErrors.length;

  return (
    <>
      {/* Source preview modal */}
      <SourcePreviewModal
        open={showSourcePreview}
        onOpenChange={setShowSourcePreview}
        rawText={rawText}
        mimeType={mimeType}
      />

      <div
        className={cn(
          "rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
          isConfirmed  && "border-green-500/50 bg-green-500/5",
          isDiscarded  && "opacity-50",
          hasErrors && !isDiscarded && !isConfirmed && "border-yellow-500/50",
        )}
      >
        {/* ── Header strip ──────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center justify-between rounded-t-xl border-b px-3 py-2 gap-2",
            hasErrors ? "bg-yellow-500/8" : "bg-primary/5",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {/* Confidence badge */}
            <ConfidenceBadge suggestion={suggestion} showScore />

            {/* Needs review warning */}
            {hasErrors && (
              <button
                type="button"
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 hover:underline underline-offset-2 focus-visible:outline-none"
                aria-expanded={showErrors}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {errorCount} issue{errorCount !== 1 ? "s" : ""}
                {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Source traceability button */}
            <SourceIconButton
              mimeType={mimeType}
              onClick={() => setShowSourcePreview(true)}
            />

            {/* State badges */}
            {isConfirmed && (
              <Badge
                variant="outline"
                className="border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400 text-xs"
              >
                ✓ Confirmed
              </Badge>
            )}
            {isDiscarded && (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                Discarded
              </Badge>
            )}
          </div>
        </div>

        {/* ── Validation errors (collapsible) ───────────────────────────── */}
        {hasErrors && showErrors && (
          <div
            className="border-b border-yellow-500/20 bg-yellow-500/5 px-3 py-2"
            role="alert"
            aria-label="Validation issues"
          >
            <p className="mb-1.5 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
              The following fields were auto-corrected and need your attention:
            </p>
            <ul className="space-y-0.5 pl-1">
              {suggestion.validationErrors.map((err, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-700/80 dark:text-yellow-400/80">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                  <span>
                    <code className="font-mono font-semibold">{err.field}</code>:{" "}
                    {err.message}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-yellow-700/70 dark:text-yellow-400/60">
              Use the Edit button to correct these fields before confirming.
            </p>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          {isEditing ? (
            // ── Inline edit form ─────────────────────────────────────────
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`title-${suggestion.id}`}>Title *</Label>
                <Input
                  id={`title-${suggestion.id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  placeholder="Task title"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`desc-${suggestion.id}`}>Description</Label>
                <Textarea
                  id={`desc-${suggestion.id}`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional details"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`due-${suggestion.id}`}>Due date</Label>
                <Input
                  id={`due-${suggestion.id}`}
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACADEMIC">Academic</SelectItem>
                      <SelectItem value="WORK">Work</SelectItem>
                      <SelectItem value="PERSONAL">Personal</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={saveEdits} disabled={!title.trim()}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Save &amp; clear issues
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdits}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            // ── View mode ────────────────────────────────────────────────
            <>
              {/* Title + description */}
              <div>
                <h3 className={cn(
                  "font-semibold leading-snug",
                  isDiscarded && "line-through text-muted-foreground",
                )}>
                  {suggestion.title}
                </h3>
                {suggestion.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {suggestion.description}
                  </p>
                )}
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn("text-xs", PRIORITY_STYLES[suggestion.priority])}
                >
                  {suggestion.priority}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
                </Badge>
                {suggestion.dueDate && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(suggestion.dueDate)}
                  </span>
                )}
              </div>

              {/* Recurrence + reminders */}
              {(suggestion.recurrenceRule || (suggestion.reminderOffsets?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.recurrenceRule && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="h-3 w-3 text-primary/70" />
                      {suggestion.recurrenceRule}
                    </span>
                  )}
                  {suggestion.reminderOffsets?.map((offset) => (
                    <span
                      key={offset}
                      className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary/80"
                    >
                      <Bell className="h-2.5 w-2.5" />
                      {formatReminderOffset(offset)}
                    </span>
                  ))}
                </div>
              )}

              {/* Source snippet (collapsible) */}
              {suggestion.extractedSourceSnippet && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowSnippet((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    aria-expanded={showSnippet}
                  >
                    <Quote className="h-3 w-3" />
                    Source snippet
                    {showSnippet ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {showSnippet && (
                    <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-xs italic text-muted-foreground">
                      {suggestion.extractedSourceSnippet}
                    </blockquote>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Action bar ────────────────────────────────────────────────── */}
        {!isEditing && !isDiscarded && (
          <div className="flex items-center gap-1.5 border-t px-3 py-2.5">
            {!isConfirmed ? (
              <>
                <Button
                  size="sm"
                  className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700"
                  onClick={() => onConfirm(suggestion)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {hasErrors ? "Review & edit" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 gap-1 text-destructive hover:text-destructive"
                  onClick={() => onDiscard(suggestion.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 gap-1 text-muted-foreground"
                  onClick={() => onDiscard(suggestion.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  Undo
                </Button>
              </>
            )}
          </div>
        )}

        {!isEditing && isDiscarded && (
          <div className="flex items-center border-t px-3 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onConfirm(suggestion)}
            >
              Restore
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
