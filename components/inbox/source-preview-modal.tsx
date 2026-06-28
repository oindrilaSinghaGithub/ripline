"use client";

/**
 * SourcePreviewModal
 *
 * Shows a clickable source-type icon on each suggestion card.
 * Clicking it opens a modal with the original raw text that produced the task.
 *
 * Uses only client-side data already present in the component tree
 * (rawText + mimeType passed down from InboxController → ReviewPanel → cards).
 * No new API calls or backend changes needed.
 */

import * as React from "react";
import {
  FileText,
  ImageIcon,
  FileType2,
  ScanText,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SourceMimeType } from "@/lib/ai/types";

// ─── Source type metadata ─────────────────────────────────────────────────────

type SourceMeta = {
  label: string;
  icon: React.ElementType;
  color: string;
  badgeClass: string;
};

const SOURCE_META: Record<SourceMimeType, SourceMeta> = {
  "text/plain": {
    label: "Text",
    icon: FileText,
    color: "text-blue-500",
    badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  "image/png": {
    label: "Image (PNG)",
    icon: ImageIcon,
    color: "text-purple-500",
    badgeClass: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  },
  "image/jpeg": {
    label: "Image (JPG)",
    icon: ImageIcon,
    color: "text-purple-500",
    badgeClass: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  },
  "application/pdf": {
    label: "PDF",
    icon: FileType2,
    color: "text-red-500",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
};

// For OCR-processed content (image/PDF where text was extracted)
function isOcrSource(mimeType: SourceMimeType): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "application/pdf";
}

// ─── Source icon button (shown on each card) ──────────────────────────────────

interface SourceIconButtonProps {
  mimeType: SourceMimeType;
  onClick: () => void;
  className?: string;
}

export function SourceIconButton({ mimeType, onClick, className }: SourceIconButtonProps) {
  const meta = SOURCE_META[mimeType] ?? SOURCE_META["text/plain"];
  const Icon = isOcrSource(mimeType) ? ScanText : meta.icon;
  const label = isOcrSource(mimeType) ? `${meta.label} (OCR)` : meta.label;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Source: ${label} — click to preview`}
      aria-label={`Preview ${label} source`}
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        meta.badgeClass,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
    </button>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────

interface SourcePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawText: string;
  mimeType: SourceMimeType;
}

export function SourcePreviewModal({
  open,
  onOpenChange,
  rawText,
  mimeType,
}: SourcePreviewModalProps) {
  const meta = SOURCE_META[mimeType] ?? SOURCE_META["text/plain"];
  const isOcr = isOcrSource(mimeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isOcr ? (
              <ScanText className={cn("h-4 w-4", meta.color)} />
            ) : (
              <meta.icon className={cn("h-4 w-4", meta.color)} />
            )}
            Source preview
            <Badge variant="outline" className={cn("ml-1 text-xs", meta.badgeClass)}>
              {isOcr ? `${meta.label} (OCR extracted)` : meta.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isOcr && (
          <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This is the text extracted from your {meta.label.toLowerCase()} via OCR.
              The original file is not stored — only the extracted text.
            </span>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/20 p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
            {rawText || <span className="text-muted-foreground italic">No content available</span>}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
