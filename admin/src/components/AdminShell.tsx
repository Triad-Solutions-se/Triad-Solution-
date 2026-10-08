"use client";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TimerProvider } from "./TimerProvider";
import { TimerFab } from "./TimerFab";

const COLLAPSE_KEY = "triad-sidebar-collapsed";

export function AdminShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "0") setCollapsed(false);
  }, []);

  const toggleCollapse = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });

  return (
    <TimerProvider>
      <div className="flex min-h-screen">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          userEmail={userEmail}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[var(--surface)]/90 backdrop-blur sticky top-0 z-30 shadow-sm shadow-black/30">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
              aria-label="Öppna meny"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/admin/logos/mca-icon.svg"
                alt="MCA Solutions"
                className="h-6 w-6 object-contain"
              />
              <span className="font-heading font-bold text-sm truncate">MCA Admin</span>
            </div>
          </header>

          {/* Extra bottom padding on phones keeps content clear of the timer button. */}
          <main className="flex-1 px-4 pt-6 pb-24 lg:px-8 lg:py-8">{children}</main>
        </div>

        <TimerFab />
      </div>
    </TimerProvider>
  );
}
