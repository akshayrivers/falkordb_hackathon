"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export function useDarkClass(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function ThemeToggle() {
  const dark = useDarkClass();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  }

  return (
    <Button type="button" variant="outline" aria-pressed={dark} onClick={toggle}>
      {ready ? (dark ? "Light mode" : "Dark mode") : "Theme"}
    </Button>
  );
}
