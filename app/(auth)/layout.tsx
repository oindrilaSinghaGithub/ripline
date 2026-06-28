import Link from "next/link";
import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Minimal header */}
      <header className="flex h-16 items-center px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight"
        >
          <Zap className="h-5 w-5 text-primary" />
          Ripline
        </Link>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center p-6">
        {children}
      </main>

      <footer className="flex h-16 items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Ripline, Inc.
        </p>
      </footer>
    </div>
  );
}
