"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/bookkeeping", label: "Att godkänna", exact: true },
  { href: "/admin/bookkeeping/verifikationer", label: "Verifikationer" },
  { href: "/admin/bookkeeping/huvudbok", label: "Huvudbok" },
  { href: "/admin/bookkeeping/moms", label: "Moms" },
  { href: "/admin/bookkeeping/kundfordringar", label: "Kundfordringar" },
  { href: "/admin/bookkeeping/rapporter", label: "Rapporter" },
  { href: "/admin/bookkeeping/installningar", label: "Inställningar" },
];

export function BookkeepingTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mt-2 mb-6 flex gap-1 overflow-x-auto scroll-x-hint" aria-label="Bokföring">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-btn px-3 py-2 text-sm transition-colors ${
              active ? "bg-white/10 font-medium text-white" : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
