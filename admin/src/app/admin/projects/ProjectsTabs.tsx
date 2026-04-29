import Link from "next/link";

export type ProjectsTab = "projects" | "ideas";

export function ProjectsTabs({ active, counts }: { active: ProjectsTab; counts: { projects: number; ideas: number } }) {
  const tabs: { value: ProjectsTab; label: string; href: string; count: number }[] = [
    { value: "projects", label: "Projekt", href: "/admin/projects", count: counts.projects },
    { value: "ideas", label: "Idébank", href: "/admin/projects?tab=ideas", count: counts.ideas },
  ];

  return (
    <div className="mb-6 flex items-center gap-1 border-b border-white/8">
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <Link
            key={t.value}
            href={t.href}
            className={`relative px-4 py-2.5 text-sm transition-colors ${
              isActive
                ? "text-white font-medium"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                  isActive ? "bg-[var(--triad-teal)]/20 text-[var(--triad-teal)]" : "bg-white/5 text-[var(--muted)]"
                }`}
              >
                {t.count}
              </span>
            </span>
            {isActive && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[var(--triad-teal)]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
