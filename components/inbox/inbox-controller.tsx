"use client";

import * as React from "react";
import { AlertCircle, X } from "lucide-react";
import { InputPanel } from "./input-panel";
import { ReviewPanel } from "./review-panel";
import { saveSource } from "@/lib/actions/inbox";
import type { TaskSuggestion, SourceMimeType } from "@/lib/ai/types";
import type { SourceType } from "@prisma/client";

const MIME_TO_SOURCE_TYPE: Record<SourceMimeType, SourceType> = {
  "text/plain": "TEXT",
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "application/pdf": "PDF",
};

type Phase = "input" | "review";

export function InboxController() {
  const [phase, setPhase] = React.useState<Phase>("input");
  const [suggestions, setSuggestions] = React.useState<TaskSuggestion[]>([]);
  const [rawText, setRawText] = React.useState("");
  const [mimeType, setMimeType] = React.useState<SourceMimeType>("text/plain");
  const [sourceId, setSourceId] = React.useState<string | null>(null);
  const [isSavingSource, setIsSavingSource] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSuggestions(
    incoming: TaskSuggestion[],
    text: string,
    mime: SourceMimeType
  ) {
    setError(null);
    setSuggestions(incoming);
    setRawText(text);
    setMimeType(mime);

    // Save source record immediately so the review panel can link tasks to it
    setIsSavingSource(true);
    try {
      const source = await saveSource({
        sourceType: MIME_TO_SOURCE_TYPE[mime],
        originalContent: text,
      });
      setSourceId(source.id);
    } catch {
      // Non-fatal: review can still proceed, save action will re-check
      setSourceId(null);
    } finally {
      setIsSavingSource(false);
    }

    setPhase("review");
  }

  function handleReset() {
    setPhase("input");
    setSuggestions([]);
    setRawText("");
    setSourceId(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {phase === "input" ? (
        <InputPanel
          onSuggestions={handleSuggestions}
          onError={setError}
          disabled={isSavingSource}
        />
      ) : (
        <ReviewPanel
          suggestions={suggestions}
          sourceId={sourceId}
          rawText={rawText}
          mimeType={mimeType}
          onReset={handleReset}
          onSourceSaved={setSourceId}
        />
      )}
    </div>
  );
}
