"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, FolderKanban, Calendar, Users, FileText,
  Wallet, Palette, BookTemplate, BarChart3, LogOut, X,
} from "lucide-react";

const nav = [
  { href: "/admin", label: "Översikt", icon: LayoutDashboard, exact: true },
  { href: "/admin/tasks", label: "Uppgifter", icon: CheckSquare },
  { href: "/admin/projects", label: "Projekt", icon: FolderKanban },
  { href: "/admin/meetings", label: "Möten", icon: Calendar },
  { href: "/admin/customers", label: "Kunder", icon: Users },
  { href: "/admin/documents", label: "Dokument", icon: FileText },
  { href: "/admin/finance", label: "Ekonomi", icon: Wallet },
  { href: "/admin/analytics", label: "Analys", icon: BarChart3 },
  { href: "/admin/brand", label: "Grafisk Profil", icon: Palette },
  { href: "/admin/templates", label: "Mallar", icon: BookTemplate },
];

export function Sidebar({
  userEmail,
  isOpen = false,
  onClose,
}: {
  userEmail: string;
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-white/8 bg-[var(--surface)] backdrop-blur flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        lg:static lg:translate-x-0 lg:h-screen lg:sticky lg:top-0
      `}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between gap-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/logos/Logo_White_Icon.png"
            alt="Triad"
            className="h-9 w-9 object-contain"
          />
          <div>
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
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-colors overflow-hidden ${
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
                  className={active ? "text-teal-400" : "text-[var(--muted)]"}
                />
                {item.label}
              </Link>
              {dividerAfter && (
                <div className="my-2 mx-3 border-t border-white/5" />
              )}
            </div>
          );
        })}
      </nav>

      {/* User / Logout */}
      <form action="/admin/auth/signout" method="post" className="border-t border-white/5 p-3">
        <div className="text-xs text-[var(--muted)] px-2 py-1 truncate">{userEmail}</div>
        <button
          type="submit"
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-btn text-sm text-[var(--muted)] hover:text-white hover:bg-white/5"
        >
          <LogOut size={16} />
          Logga ut
        </button>
      </form>
    </aside>
  );
}
