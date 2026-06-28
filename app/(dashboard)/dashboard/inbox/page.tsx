import type { Metadata } from "next";
import { Sparkles, History } from "lucide-react";
import { auth } from "@/lib/auth";
import { getSourceHistory } from "@/lib/actions/inbox";
import { InboxController } from "@/components/inbox/inbox-controller";
import { SourceHistory } from "@/components/inbox/source-history";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Inbox",
};

export default async function InboxPage() {
  const session = await auth();
  const sources = await getSourceHistory(20);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">AI Inbox</h1>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Beta
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste text, upload an image or PDF, and let AI extract task suggestions.
            Review every suggestion before saving.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: Input + Review */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">New extraction</CardTitle>
            <CardDescription>
              AI suggestions are never saved automatically — you must confirm each one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InboxController />
          </CardContent>
        </Card>

        {/* Right: Source history */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Upload history</h2>
            <span className="text-xs text-muted-foreground">({sources.length})</span>
          </div>
          <SourceHistory sources={sources} />
        </div>
      </div>
    </div>
  );
}
