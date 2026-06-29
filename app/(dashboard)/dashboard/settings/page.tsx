"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Briefcase, Moon, Save, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProfile } from "@/components/profile-provider";

export default function SettingsPage() {
  const { profile, updateProfile, getInitials } = useProfile();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  const [name, setName] = React.useState(profile.name);
  const [workspaceName, setWorkspaceName] = React.useState("Team AI Project");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    setName(profile.name);
  }, [profile.name]);

  const isDark = mounted && resolvedTheme === "dark";

  function handleSave() {
    updateProfile({ name: name.trim() || profile.name });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function handleThemeToggle() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile, workspace preferences, and appearance.
          </p>
        </div>
        <Button className="gap-2" onClick={handleSave}>
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : "Save changes"}
        </Button>
      </div>

      {saved && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          Profile saved — your name will update across the dashboard.
        </div>
      )}

      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted-foreground" />
              Profile
            </CardTitle>
            <CardDescription>
              Your personal account details visible to workspace members.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage
                  src={profile.avatarUrl ?? undefined}
                  alt={profile.name}
                />
                <AvatarFallback className="text-base">
                  {getInitials(name || profile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm text-muted-foreground">
                Avatar uses your initials when no photo is set.
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                value={profile.email}
                readOnly
                className="bg-muted/50 text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email comes from your sign-in provider and cannot be changed here.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Workspace
            </CardTitle>
            <CardDescription>
              Settings for your currently active workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
            />
            <p className="text-xs text-muted-foreground">
              Renaming applies to this session only.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Moon className="h-4 w-4 text-muted-foreground" />
              Appearance
            </CardTitle>
            <CardDescription>
              Customize how Ripline looks on your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Dark mode</p>
                <p className="text-xs text-muted-foreground">
                  Applies across the entire dashboard. Defaults to your system
                  preference until you toggle.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                disabled={!mounted}
                onClick={handleThemeToggle}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  isDark ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
                    isDark ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {mounted ? (
                <>
                  {isDark ? (
                    <Moon className="h-3.5 w-3.5" />
                  ) : (
                    <Sun className="h-3.5 w-3.5" />
                  )}
                  Current theme:{" "}
                  <span className="font-medium text-foreground">
                    {resolvedTheme === "dark" ? "Dark" : "Light"}
                  </span>
                </>
              ) : (
                "Loading theme…"
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
