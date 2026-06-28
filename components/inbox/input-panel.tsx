"use client";

import * as React from "react";
import { Upload, FileText, ImageIcon, FileType2, Loader2, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { SourceMimeType, TaskSuggestion } from "@/lib/ai/types";

const ACCEPTED_IMAGE = ["image/png", "image/jpeg"];
const ACCEPTED_PDF = ["application/pdf"];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (matches API limit)

interface InputPanelProps {
  onSuggestions: (
    suggestions: TaskSuggestion[],
    rawText: string,
    mimeType: SourceMimeType
  ) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

type InputMode = "text" | "image" | "pdf";

/** Which provider was used, returned in the API response */
type Provider = "llm" | "heuristic" | "none";

export function InputPanel({ onSuggestions, onError, disabled }: InputPanelProps) {
  const [mode, setMode] = React.useState<InputMode>("text");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [processingStep, setProcessingStep] = React.useState<string>("");
  const [lastProvider, setLastProvider] = React.useState<Provider | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setFile(null);
    setLastProvider(null);
    setProcessingStep("");
  }

  function handleModeChange(next: InputMode) {
    setMode(next);
    reset();
  }

  // ─── Drag & drop ─────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  function handleFileSelect(f: File) {
    if (f.size > MAX_FILE_BYTES) {
      onError(
        `File is too large (max 10 MB). "${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB.`
      );
      return;
    }
    const accepted = [...ACCEPTED_IMAGE, ...ACCEPTED_PDF, "text/plain"];
    if (!accepted.includes(f.type)) {
      onError(`Unsupported file type: ${f.type || "unknown"}. Use PNG, JPG, PDF, or TXT.`);
      return;
    }
    setFile(f);
    if (ACCEPTED_IMAGE.includes(f.type)) setMode("image");
    else if (f.type === "application/pdf") setMode("pdf");
    else setMode("text");
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setIsProcessing(true);
    setLastProvider(null);
    setProcessingStep("");

    try {
      let res: Response;

      if (mode === "text") {
        if (!text.trim()) {
          onError("Please enter some text before processing.");
          return;
        }

        setProcessingStep("Analysing text…");
        res = await fetch("/api/inbox/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), mimeType: "text/plain" }),
        });
      } else {
        if (!file) {
          onError("Please select a file first.");
          return;
        }

        // Send the raw file bytes as multipart — server runs OCR
        const isImage = ACCEPTED_IMAGE.includes(file.type);
        setProcessingStep(isImage ? "Running OCR on image…" : "Extracting text from PDF…");

        const form = new FormData();
        form.append("file", file);
        form.append("mimeType", file.type);

        // Brief pause so the user sees the OCR step message
        await new Promise((r) => setTimeout(r, 100));
        setProcessingStep("Extracting tasks with AI…");

        res = await fetch("/api/inbox/process", {
          method: "POST",
          body: form,
          // No Content-Type header — browser sets it with the boundary
        });
      }

      const json = await res.json();

      if (!res.ok || !json.success) {
        onError(json.error ?? "Extraction failed. Please try again.");
        return;
      }

      const data = json.data as {
        success: boolean;
        suggestions?: TaskSuggestion[];
        error?: string;
        provider?: Provider;
        ocrConfidence?: number | null;
      };

      if (!data.success) {
        onError(data.error ?? "Could not extract tasks from the provided content.");
        return;
      }

      if (!data.suggestions || data.suggestions.length === 0) {
        onError("No tasks were found in the provided content. Try adding more detail.");
        return;
      }

      setLastProvider(data.provider ?? null);

      // Pass the extracted text back as rawText (for source record)
      const rawText = mode === "text" ? text.trim() : `[${file?.name ?? "file"}]`;
      const mimeType: SourceMimeType =
        mode === "text"
          ? "text/plain"
          : (file?.type as SourceMimeType) ?? "text/plain";

      onSuggestions(data.suggestions, rawText, mimeType);
    } catch {
      onError("Network error. Please check your connection and try again.");
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  }

  const canSubmit =
    !disabled && !isProcessing && (mode === "text" ? !!text.trim() : !!file);

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist">
        {(
          [
            { id: "text", label: "Text", icon: FileText },
            { id: "image", label: "Image", icon: ImageIcon },
            { id: "pdf", label: "PDF", icon: FileType2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => handleModeChange(id)}
            disabled={isProcessing}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Input area */}
      {mode === "text" ? (
        <div className="space-y-1.5">
          <Label htmlFor="inbox-text">Paste your text</Label>
          <Textarea
            id="inbox-text"
            placeholder={`Paste notes, emails, messages, or any text containing tasks…\n\nExample:\n• Submit the Q3 report by Friday\n• Schedule a review meeting next Monday\n• Buy groceries before the weekend`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isProcessing}
            rows={10}
            className="resize-none font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {text.length.toLocaleString()} characters
          </p>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileRef.current?.click()}
            className={cn(
              "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              isProcessing && "pointer-events-none opacity-60"
            )}
            role="button"
            tabIndex={0}
            aria-label={`Upload ${mode === "image" ? "image" : "PDF"} file`}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            {file ? (
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB — click to change
                </p>
              </div>
            ) : (
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">
                  Drop a {mode === "image" ? "PNG or JPG" : "PDF"} here
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to browse · max 10 MB
                </p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={mode === "image" ? ".png,.jpg,.jpeg" : ".pdf"}
              className="sr-only"
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* OCR notice */}
          <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              {mode === "image"
                ? "The image will be processed with OCR to extract text before task analysis."
                : "Text will be extracted from the PDF before task analysis."}
              {" "}
              Configure <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">OCR_PROVIDER</code> in your environment for production OCR.
            </p>
          </div>
        </>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="gap-2 min-w-[140px]"
          aria-busy={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{processingStep || "Analysing…"}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Extract tasks
            </>
          )}
        </Button>

        {(mode === "text" ? !!text : !!file) && !isProcessing && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Show which backend was used after the last extraction */}
          {lastProvider === "llm" && (
            <Badge variant="default" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              LLM
            </Badge>
          )}
          {lastProvider === "heuristic" && (
            <Badge variant="secondary" className="text-xs">
              Heuristic
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            AI-powered
          </Badge>
        </div>
      </div>
    </div>
  );
}
