"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // The init script in <head> already applied the stored theme; just mirror it.
  useEffect(() => {
    if (document.documentElement.dataset.theme === "light") setTheme("light");
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";
  const label = next === "light" ? "Ljust tema" : "Mörkt tema";
  const Icon = next === "light" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      title={label}
      aria-label={label}
      className={`flex items-center gap-3 mx-2 mb-1 px-3 py-2.5 rounded-btn text-sm text-[var(--muted)] hover:text-white hover:bg-white/5 transition-colors ${
        collapsed ? "lg:justify-center lg:px-0" : ""
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
    </button>
  );
}
