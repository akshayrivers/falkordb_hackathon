"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const path = usePathname();
  const onHelp = path === "/help";
  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <a href="/" className="font-heading text-sm font-semibold tracking-tight">
        Sever
      </a>
      <nav className="flex items-center gap-2">
        <Button
          variant={onHelp ? "outline" : "ghost"}
          nativeButton={false}
          render={<a href="/" aria-current={onHelp ? undefined : "page"} />}
        >
          Graph
        </Button>
        <Button
          variant={onHelp ? "secondary" : "ghost"}
          nativeButton={false}
          render={<a href="/help" aria-current={onHelp ? "page" : undefined} />}
        >
          Help
        </Button>
        <ThemeToggle />
      </nav>
    </header>
  );
}
