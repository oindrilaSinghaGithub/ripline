"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Settings,
  Users,
  Zap,
  ClipboardList,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";

const navItems = [
  { label: "Dashboard",   href: "/dashboard",          icon: LayoutDashboard },
  { label: "Tasks",       href: "/dashboard/tasks",     icon: ClipboardList },
  { label: "Calendar",    href: "/dashboard/calendar",  icon: CalendarDays },
  { label: "AI Inbox",    href: "/dashboard/inbox",     icon: Sparkles },
  { label: "Workspaces",  href: "/dashboard/workspaces",icon: Briefcase },
  { label: "Members",     href: "/dashboard/members",   icon: Users },
  { label: "Settings",    href: "/dashboard/settings",  icon: Settings },
];

interface DashboardSidebarProps {
  user: SessionUser;
}

export function DashboardSidebar({ user: _user }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 flex-col border-r bg-card lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4 font-bold text-lg tracking-tight">
        <Zap className="h-5 w-5 text-primary" />
        Ripline
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
