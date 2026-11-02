type Tone = "teal" | "green" | "yellow" | "red" | "gray" | "blue" | "purple" | "orange" | "pink";

const tones: Record<Tone, string> = {
  teal: "bg-[#00b4a8]/15 text-[var(--chip-teal)] border-[#00b4a8]/25",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  red: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  gray: "bg-white/5 text-white/70 border-white/10",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  purple: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/25",
  pink: "bg-pink-500/15 text-pink-300 border-pink-500/25",
};

export function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
