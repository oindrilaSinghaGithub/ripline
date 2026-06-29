"use client";

import * as React from "react";
import { Mail, Plus, Shield, UserPlus, Users } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useProfile } from "@/components/profile-provider";

type Role = "Admin" | "Member";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  pending?: boolean;
};

const OTHER_MEMBERS: Member[] = [
  {
    id: "2",
    name: "Alex Chen",
    email: "alex.chen@example.com",
    role: "Member",
  },
  {
    id: "3",
    name: "Sam Rivera",
    email: "sam.rivera@example.com",
    role: "Member",
  },
  {
    id: "4",
    name: "Priya Patel",
    email: "priya.patel@example.com",
    role: "Admin",
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MembersPage() {
  const { profile, getInitials } = useProfile();
  const [extraMembers, setExtraMembers] = React.useState<Member[]>([]);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("Member");
  const [inviteNotice, setInviteNotice] = React.useState<string | null>(null);

  const members = React.useMemo<Member[]>(
    () => [
      {
        id: "1",
        name: profile.name,
        email: profile.email,
        role: "Admin",
      },
      ...OTHER_MEMBERS,
      ...extraMembers,
    ],
    [profile.email, profile.name, extraMembers]
  );

  function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;

    const nameFromEmail = email.split("@")[0].replace(/[._]/g, " ");
    const displayName = nameFromEmail
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    const newMember: Member = {
      id: `invite-${Date.now()}`,
      name: displayName,
      email,
      role: inviteRole,
      pending: true,
    };

    setExtraMembers((prev) => [...prev, newMember]);
    setInviteEmail("");
    setInviteRole("Member");
    setInviteOpen(false);
    setInviteNotice(`Invitation sent to ${email}`);
    window.setTimeout(() => setInviteNotice(null), 4000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who has access to{" "}
            <span className="font-medium text-foreground">Team AI Project</span>.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {inviteNotice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          {inviteNotice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            Workspace members
          </CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person" : "people"} in this
            workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.id === "1"
                              ? getInitials(profile.name)
                              : getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {member.name}
                          {member.id === "1" && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {member.email}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={member.role === "Admin" ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {member.role === "Admin" && (
                          <Shield className="h-3 w-3" aria-hidden="true" />
                        )}
                        {member.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          member.pending
                            ? "text-yellow-700 dark:text-yellow-400"
                            : "text-green-700 dark:text-green-400"
                        )}
                      >
                        {member.pending ? "Invite pending" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Send a workspace invitation by email. No email is actually sent in this
              demo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as Role)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Member">Member</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-2"
              onClick={handleInvite}
              disabled={!inviteEmail.trim().includes("@")}
            >
              <Plus className="h-4 w-4" />
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
