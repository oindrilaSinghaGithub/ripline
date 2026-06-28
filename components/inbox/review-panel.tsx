"use client";

import * as React from "react";
import {
  CheckCheck,
  Trash2,
  RotateCcw,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SuggestionCard, type SuggestionState } from "./suggestion-card";
import { confirmSuggestions } from "@/lib/actions/inbox";
import type { TaskSuggestion, SourceMimeType } from "@/lib/ai/types";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewPanelProps {
  suggestions: TaskSuggestion[];
  sourceId: string | null;
  rawText: string;
  mimeType: SourceMimeType;
  onReset: () => void;
  onSourceSaved: (id: string) => void;
}

type SuggestionEntry = { suggestion: TaskSuggestion; state: SuggestionState };
type SuggestionMap = Map<string, SuggestionEntry>;
type TabId = "high" | "review";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNeedsReview(s: TaskSuggestion): boolean {
  return s.needsReview === true;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewPanel({
  suggestions: initialSuggestions,
  sourceId,
  rawText,
  mimeType,
  onReset,
  onSourceSaved: _onSourceSaved,
}: ReviewPanelProps) {
  const [map, setMap] = React.useState<SuggestionMap>(() => {
    const m: SuggestionMap = new Map();
    for (const s of initialSuggestions) {
      m.set(s.id, { suggestion: s, state: "pending" });
    }
    return m;
  });

  const [activeTab, setActiveTab] = React.useState<TabId>(() =>
    // Default to "review" if any items need review, otherwise "high"
    initialSuggestions.some(isNeedsReview) ? "review" : "high"
  );

  const [isSaving, setIsSaving] = React.useState(false);
  const [savedCount, setSavedCount] = React.useState<number | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const allItems = Array.from(map.values());

  // Tab partitions — based on the current suggestion state, not just initial
  const highItems   = allItems.filter((i) => !isNeedsReview(i.suggestion));
  const reviewItems = allItems.filter((i) =>  isNeedsReview(i.suggestion));

  const tabItems = activeTab === "high" ? highItems : reviewItems;

  // Global counts
  const pending   = allItems.filter((i) => i.state === "pending");
  const confirmed = allItems.filter((i) => i.state === "confirmed");
  const discarded = allItems.filter((i) => i.state === "discarded");

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleConfirm(suggestion: TaskSuggestion) {
    setMap((prev) => {
      const next = new Map(prev);
      next.set(suggestion.id, { suggestion, state: "confirmed" });
      return next;
    });
  }

  function handleDiscard(id: string) {
    setMap((prev) => {
      const next = new Map(prev);
      const item = next.get(id);
      if (item) next.set(id, { ...item, state: "discarded" });
      return next;
    });
  }

  function handleUpdate(suggestion: TaskSuggestion) {
    setMap((prev) => {
      const next = new Map(prev);
      const item = next.get(suggestion.id);
      if (item) next.set(suggestion.id, { suggestion, state: item.state });
      return next;
    });
  }

  // ─── Bulk actions (scoped to current tab) ──────────────────────────────

  function confirmTabPending() {
    setMap((prev) => {
      const next = new Map(prev);
      for (const { suggestion, state } of tabItems) {
        if (state === "pending") {
          next.set(suggestion.id, { suggestion, state: "confirmed" });
        }
      }
      return next;
    });
  }

  function discardTabPending() {
    setMap((prev) => {
      const next = new Map(prev);
      for (const { suggestion, state } of tabItems) {
        if (state === "pending") {
          next.set(suggestion.id, { ...next.get(suggestion.id)!, state: "discarded" });
        }
      }
      return next;
    });
  }

  // ─── Save ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!sourceId || confirmed.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const tasks = await confirmSuggestions(
        sourceId,
        confirmed.map((i) => i.suggestion),
      );
      setSavedCount(tasks.length);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save tasks.");
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Post-save success ──────────────────────────────────────────────────

  if (savedCount !== null) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
          <CheckCheck className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">
            {savedCount} {savedCount === 1 ? "task" : "tasks"} saved
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your confirmed tasks have been added to your task list.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Process another
          </Button>
          <Button asChild>
            <Link href="/dashboard/tasks">
              View tasks
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ─── Tab pending counts ─────────────────────────────────────────────────

  const highPending   = highItems.filter((i)   => i.state === "pending").length;
  const reviewPending = reviewItems.filter((i) => i.state === "pending").length;
  const tabPending    = tabItems.filter((i)    => i.state === "pending").length;

  return (
    <div className="space-y-4">

      {/* ── Global status line ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Review suggestions</h2>
          <p className="text-xs text-muted-foreground">
            {pending.length} pending · {confirmed.length} confirmed · {discarded.length} discarded
          </p>
        </div>
        <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1.5" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </Button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist">
        {/* High Confidence tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "high"}
          onClick={() => setActiveTab("high")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "high"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
          High Confidence
          {highItems.length > 0 && (
            <Badge
              variant={activeTab === "high" ? "default" : "secondary"}
              className="h-5 min-w-[1.25rem] rounded-full px-1.5 text-[10px]"
            >
              {highItems.length}
            </Badge>
          )}
          {highPending > 0 && activeTab !== "high" && (
            <span className="ml-0.5 h-2 w-2 rounded-full bg-green-500" aria-label="has pending items" />
          )}
        </button>

        {/* Needs Review tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "review"}
          onClick={() => setActiveTab("review")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "review"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" aria-hidden="true" />
          Needs Review
          {reviewItems.length > 0 && (
            <Badge
              variant={activeTab === "review" ? "default" : "secondary"}
              className={cn(
                "h-5 min-w-[1.25rem] rounded-full px-1.5 text-[10px]",
                reviewPending > 0 && activeTab !== "review" &&
                  "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
              )}
            >
              {reviewItems.length}
            </Badge>
          )}
          {reviewPending > 0 && activeTab !== "review" && (
            <span className="ml-0.5 h-2 w-2 animate-pulse rounded-full bg-yellow-500" aria-label="has pending items" />
          )}
        </button>
      </div>

      {/* ── Tab description ──────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground">
        {activeTab === "high"
          ? "These suggestions passed all validation checks. You can confirm them directly."
          : "These suggestions have auto-corrected fields. Click Edit to review before confirming."}
      </p>

      {/* ── Bulk actions for current tab ─────────────────────────────────── */}
      {tabPending > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={confirmTabPending}>
            <CheckCheck className="h-3.5 w-3.5" />
            Confirm all ({tabPending})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-destructive hover:text-destructive"
            onClick={discardTabPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard all ({tabPending})
          </Button>
        </div>
      )}

      {/* ── Cards grid ───────────────────────────────────────────────────── */}
      {tabItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          {activeTab === "high" ? (
            <>
              <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No high-confidence suggestions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All items need review — switch to the Needs Review tab.
              </p>
            </>
          ) : (
            <>
              <CheckCheck className="h-8 w-8 text-green-500/40" />
              <p className="mt-3 text-sm font-medium">No items need review</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All suggestions passed validation — check the High Confidence tab.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tabItems.map(({ suggestion, state }) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              state={state}
              rawText={rawText}
              mimeType={mimeType}
              onConfirm={handleConfirm}
              onDiscard={handleDiscard}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {/* ── Sticky save bar ──────────────────────────────────────────────── */}
      {confirmed.length > 0 && (
        <div
          className={cn(
            "sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-lg",
            "ring-1 ring-green-500/30",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
              <CheckCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {confirmed.length} {confirmed.length === 1 ? "task" : "tasks"} ready to save
              </p>
              {pending.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {pending.length} still awaiting review
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Badge variant="secondary" className="text-xs">Not saved yet</Badge>
            <Button
              onClick={handleSave}
              disabled={isSaving || !sourceId}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCheck className="h-4 w-4" />
                  Save {confirmed.length} {confirmed.length === 1 ? "task" : "tasks"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
