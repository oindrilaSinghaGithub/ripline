"use client";

import * as React from "react";
import { useProfile } from "@/components/profile-provider";
import type { SessionUser } from "@/types";

/** Loads or seeds profile from the logged-in session (per user, persisted in localStorage). */
export function ProfileBootstrap({ user }: { user: SessionUser }) {
  const { initializeFromSession } = useProfile();

  React.useEffect(() => {
    initializeFromSession(user);
  }, [initializeFromSession, user]);

  return null;
}
