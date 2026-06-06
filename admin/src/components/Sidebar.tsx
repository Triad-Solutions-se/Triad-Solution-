"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, FolderKanban, Calendar, Users, FileText,
  Wallet, Palette, BookTemplate, BarChart3, LogOut, X,
  PanelLeftClose, PanelLeftOpen, Settings, Sparkles,
} from "lucide-react";

const nav = [
  { href: "/admin", label: "Översikt", icon: LayoutDashboard, exact: true },
  { href: "/admin/supermind", label: "Supermind", icon: Sparkles },
  { href: "/admin/tasks", label: "Uppgifter", icon: CheckSquare },
  { href: "/admin/projects", label: "Projekt", icon: FolderKanban },
  { href: "/admin/meetings", label: "Möten", icon: Calendar },
  { href: "/admin/customers", label: "Kunder", icon: Users },
  { href: "/admin/documents", label: "Dokument", icon: FileText },
  { href: "/admin/finance", label: "Ekonomi", icon: Wallet },
  { href: "/admin/analytics", label: "Analys", icon: BarChart3 },
  { href: "/admin/brand", label: "Grafisk Profil", icon: Palette },
  { href: "/admin/templates", label: "Mallar", icon: BookTemplate },
  { href: "/admin/settings", label: "Inställningar", icon: Settings },
];

export function Sidebar({
  userEmail,
  isOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  userEmail: string;
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  // `collapsed` is a desktop-only concept — the mobile drawer always shows the
  // full-width sidebar. So every collapse-driven class is scoped with `lg:`.
  const hideWhenCollapsed = collapsed ? "lg:hidden" : "";

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-white/8 bg-[var(--surface)] backdrop-blur flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        lg:static lg:translate-x-0 lg:h-screen lg:sticky lg:top-0
        ${collapsed ? "lg:w-20" : "lg:w-64"}
      `}
    >
      {/* Logo */}
      <div
        className={`px-5 py-5 flex items-center gap-3 border-b border-white/5 ${
          collapsed ? "lg:justify-center lg:px-0" : "justify-between"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/logos/Logo_White_Icon.png"
            alt="Triad"
            className="h-9 w-9 object-contain shrink-0"
          />
          <div className={hideWhenCollapsed}>
            <div className="font-heading font-bold tracking-tight text-base">Triad</div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Admin</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
            aria-label="Stäng meny"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-2 py-3 flex-1 space-y-0.5">
        {nav.map((item, idx) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);

          const dividerAfter = idx === 0 || idx === 4;

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                title={item.label}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-colors overflow-hidden ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                } ${
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-teal-400" />
                )}
                <Icon
                  size={16}
                  className={`shrink-0 ${active ? "text-teal-400" : "text-[var(--muted)]"}`}
                />
                <span className={hideWhenCollapsed}>{item.label}</span>
              </Link>
              {dividerAfter && (
                <div className="my-2 mx-3 border-t border-white/5" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle — desktop only */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expandera meny" : "Fäll ihop meny"}
          aria-label={collapsed ? "Expandera meny" : "Fäll ihop meny"}
          className={`hidden lg:flex items-center gap-3 mx-2 mb-1 px-3 py-2.5 rounded-btn text-sm text-[var(--muted)] hover:text-white hover:bg-white/5 transition-colors ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} className="shrink-0" />
          ) : (
            <>
              <PanelLeftClose size={16} className="shrink-0" />
              <span>Fäll ihop</span>
            </>
          )}
        </button>
      )}

      {/* User / Logout */}
      <form action="/admin/auth/signout" method="post" className="border-t border-white/5 p-3">
        <div className={`text-xs text-[var(--muted)] px-2 py-1 truncate ${hideWhenCollapsed}`}>
          {userEmail}
        </div>
        <button
          type="submit"
          title="Logga ut"
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-btn text-sm text-[var(--muted)] hover:text-white hover:bg-white/5 ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          <LogOut size={16} className="shrink-0" />
          <span className={hideWhenCollapsed}>Logga ut</span>
        </button>
      </form>
    </aside>
  );
}
