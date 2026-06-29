"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ProfileProvider } from "@/components/profile-provider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ProfileProvider>{children}</ProfileProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
