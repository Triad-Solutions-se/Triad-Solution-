import Link from "next/link";
import { Megaphone } from "lucide-react";

export function SalesPitchButton({
  projectId,
  initialPitch,
}: {
  projectId: string;
  initialPitch: string | null;
}) {
  const hasPitch = Boolean(initialPitch && initialPitch.trim());
  return (
    <Link
      href={`/admin/projects/${projectId}/pitch`}
      className="rounded-btn border border-white/10 hover:bg-white/5 hover:border-white/20 text-white px-3 py-1.5 text-sm font-medium flex items-center gap-2 transition-colors"
    >
      <Megaphone size={14} />
      Säljpitch
      {!hasPitch && (
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          tom
        </span>
      )}
    </Link>
  );
}
