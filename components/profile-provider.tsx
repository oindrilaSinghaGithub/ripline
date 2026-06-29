"use client";

import * as React from "react";
import type { SessionUser } from "@/types";

export type Profile = {
  name: string;
  email: string;
  avatarUrl: string | null;
};

const FALLBACK_PROFILE: Profile = {
  name: "User",
  email: "",
  avatarUrl: null,
};

function storageKey(userId: string) {
  return `ripline-profile-${userId}`;
}

function profileFromSession(user: SessionUser): Profile {
  return {
    name: user.name?.trim() || FALLBACK_PROFILE.name,
    email: user.email?.trim() || FALLBACK_PROFILE.email,
    avatarUrl: user.image ?? null,
  };
}

function loadStoredProfile(userId: string): Profile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      name: parsed.name?.trim() || FALLBACK_PROFILE.name,
      email: parsed.email?.trim() || FALLBACK_PROFILE.email,
      avatarUrl: parsed.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

function getInitials(name?: string): string {
  if (!name?.trim()) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type ProfileContextValue = {
  profile: Profile;
  ready: boolean;
  updateProfile: (updates: Partial<Profile>) => void;
  initializeFromSession: (user: SessionUser) => void;
  getInitials: (name?: string) => string;
};

const ProfileContext = React.createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = React.useState<Profile>(FALLBACK_PROFILE);
  const [activeUserId, setActiveUserId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  const initializeFromSession = React.useCallback((user: SessionUser) => {
    const stored = loadStoredProfile(user.id);
    const next = stored ?? profileFromSession(user);

    if (!stored) {
      localStorage.setItem(storageKey(user.id), JSON.stringify(next));
    }

    setActiveUserId(user.id);
    setProfile(next);
    setReady(true);
  }, []);

  const updateProfile = React.useCallback((updates: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  React.useEffect(() => {
    if (!ready || !activeUserId) return;
    localStorage.setItem(storageKey(activeUserId), JSON.stringify(profile));
  }, [profile, ready, activeUserId]);

  const value = React.useMemo(
    () => ({
      profile,
      ready,
      updateProfile,
      initializeFromSession,
      getInitials,
    }),
    [profile, ready, updateProfile, initializeFromSession]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = React.useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
