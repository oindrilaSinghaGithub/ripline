"use client";

import * as React from "react";
import {
  Briefcase,
  Check,
  ArrowRightLeft,
  Plus,
  Users,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProfile } from "@/components/profile-provider";

type Workspace = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
};

const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: "personal",
    name: "Personal Workspace",
    description: "Your private tasks and notes",
    memberCount: 1,
  },
  {
    id: "team-ai",
    name: "Team AI Project",
    description: "Shared workspace for the hackathon build",
    memberCount: 4,
  },
];

export default function WorkspacesPage() {
  const { profile } = useProfile();
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>(INITIAL_WORKSPACES);
  const [activeId, setActiveId] = React.useState("personal");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [switchNotice, setSwitchNotice] = React.useState<string | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeId);

  function handleSwitch(id: string) {
    setActiveId(id);
    const workspace = workspaces.find((w) => w.id === id);
    setSwitchNotice(`Switched to ${workspace?.name ?? "workspace"}`);
    window.setTimeout(() => setSwitchNotice(null), 3000);
  }

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const workspace: Workspace = {
      id: `ws-${Date.now()}`,
      name: trimmed,
      description: "New workspace",
      memberCount: 1,
    };

    setWorkspaces((prev) => [...prev, workspace]);
    setActiveId(workspace.id);
    setNewName("");
    setCreateOpen(false);
    setSwitchNotice(`Created and switched to ${workspace.name}`);
    window.setTimeout(() => setSwitchNotice(null), 3000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Switch between workspaces or create a new one for your team. Signed in
            as{" "}
            <span className="font-medium text-foreground">{profile.name}</span> (
            {profile.email}).
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Workspace
        </Button>
      </div>

      {switchNotice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          {switchNotice}
        </div>
      )}

      {activeWorkspace && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardDescription>Currently active</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Briefcase className="h-4 w-4 text-primary" />
              {activeWorkspace.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {activeWorkspace.description} · {activeWorkspace.memberCount}{" "}
            {activeWorkspace.memberCount === 1 ? "member" : "members"}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeId;
          return (
            <Card
              key={workspace.id}
              className={cn(
                "transition-colors",
                isActive && "ring-1 ring-primary/40"
              )}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{workspace.name}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {workspace.id === "personal"
                          ? `${profile.name}'s private tasks and notes`
                          : workspace.description}
                      </CardDescription>
                    </div>
                  </div>
                  {isActive && (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <Check className="h-3 w-3" />
                      Active
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {workspace.memberCount}{" "}
                  {workspace.memberCount === 1 ? "member" : "members"}
                </span>
                <Button
                  variant={isActive ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  disabled={isActive}
                  onClick={() => handleSwitch(workspace.id)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {isActive ? "Current" : "Switch Workspace"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace for a project or team. This is a demo-only flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Marketing Team"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
