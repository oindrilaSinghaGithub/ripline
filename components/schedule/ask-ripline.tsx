"use client";

import * as React from "react";
import { Sparkles, Loader2, Send, AlertCircle, X, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewPanel } from "@/components/inbox/review-panel";
import { saveSource } from "@/lib/actions/inbox";
import type { TaskSuggestion } from "@/lib/ai/types";

const EXAMPLES = [
  "Every Friday I want to practice DSA for 2 hours.",
  "Remind me to pay rent on the 1st of every month.",
  "Finish my ML assignment before July 15.",
  "Book tickets next Monday at 10 AM.",
  "Study Operating Systems every weekday at 8 PM.",
  "Submit the project report by next Friday.",
];

type Phase = "input" | "review";

export function AskRipline() {
  const [phase, setPhase] = React.useState<Phase>("input");
  const [command, setCommand] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<TaskSuggestion[]>([]);
  const [sourceId, setSourceId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [command]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!command.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/schedule/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error ?? "Failed to parse command.");
        return;
      }

      const data = json.data as { success: boolean; suggestions?: TaskSuggestion[]; error?: string };
      if (!data.success || !data.suggestions?.length) {
        setError(data.error ?? "No tasks could be parsed from that command.");
        return;
      }

      setSuggestions(data.suggestions);

      // Save source record
      try {
        const source = await saveSource({ sourceType: "TEXT", originalContent: command.trim() });
        setSourceId(source.id);
      } catch {
        setSourceId(null);
      }

      setPhase("review");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    setPhase("input");
    setCommand("");
    setSuggestions([]);
    setSourceId(null);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (phase === "review") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Parsed from: <em className="text-foreground">&ldquo;{command}&rdquo;</em></span>
        </div>
        <ReviewPanel
          suggestions={suggestions}
          sourceId={sourceId}
          rawText={command}
          mimeType="text/plain"
          onReset={handleReset}
          onSourceSaved={setSourceId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-4 w-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Input box */}
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative rounded-xl border bg-background transition-shadow",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          )}
        >
          {/* Sparkle icon */}
          <div className="absolute left-3 top-3 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>

          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a natural language command…"
            disabled={isProcessing}
            rows={1}
            aria-label="Ask Ripline"
            className={cn(
              "w-full resize-none rounded-xl bg-transparent py-3 pl-9 pr-12 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none disabled:opacity-50",
              "min-h-[44px] max-h-[160px]"
            )}
          />

          <Button
            type="submit"
            size="icon"
            disabled={!command.trim() || isProcessing}
            className="absolute bottom-2 right-2 h-7 w-7 rounded-lg"
            aria-label="Parse command"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Press <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to parse ·{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd> for new line
        </p>
      </form>

      {/* Examples */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" />
          Try an example
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setCommand(ex)}
              className={cn(
                "rounded-md border bg-muted/50 px-2.5 py-1 text-left text-xs text-muted-foreground",
                "hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          AI-powered · never saves automatically
        </Badge>
      </div>
    </div>
  );
}
