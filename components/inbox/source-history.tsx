import * as React from "react";
import { FileText, ImageIcon, FileType2, Puzzle, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Source } from "@prisma/client";

type SourceWithCount = Source & { _count: { tasks: number } };

const SOURCE_TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  TEXT: { label: "Text", icon: FileText, color: "text-blue-500" },
  IMAGE: { label: "Image", icon: ImageIcon, color: "text-purple-500" },
  PDF: { label: "PDF", icon: FileType2, color: "text-red-500" },
  EXTENSION: { label: "Extension", icon: Puzzle, color: "text-orange-500" },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function truncateContent(text: string, maxLen = 80): string {
  const clean = text.replace(/\n/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}

interface SourceHistoryProps {
  sources: SourceWithCount[];
}

export function SourceHistory({ sources }: SourceHistoryProps) {
  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">No uploads yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Processed sources will appear here for reference.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sources.map((source) => {
        const meta = SOURCE_TYPE_META[source.sourceType] ?? SOURCE_TYPE_META.TEXT;
        const Icon = meta.icon;

        return (
          <Card key={source.id}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-muted-foreground">
                  {truncateContent(source.originalContent)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(source.uploadedAt)}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant="secondary" className="text-xs">
                  {meta.label}
                </Badge>
                {source._count.tasks > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {source._count.tasks} {source._count.tasks === 1 ? "task" : "tasks"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
