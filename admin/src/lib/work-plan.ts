// Planerad arbetstid (kalendern, migration 0042). Allt är väggklocka i svensk
// tid: datum som "YYYY-MM-DD" och tider som minut på dygnet. Datumräkningen går
// via UTC så att den ger samma svar på servern (UTC) och i webbläsaren.

export const SLOT_MINUTES = 15;
export const DAY_MINUTES = 1440;
export const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

// Fast lista i stället för toLocaleDateString: svenska kortformer varierar med
// ICU-version ("nov" / "nov."), vilket annars ger olika text på server och klient.
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export type WorkBlock = {
  profile_id: string;
  work_date: string;
  start_minute: number;
  end_minute: number;
};

export type Member = { id: string; display_name: string | null };
export type MinuteRange = { start: number; end: number };
export type PlacedRange = MinuteRange & { date: string };

export const WORK_BLOCK_FIELDS = "profile_id,work_date,start_minute,end_minute";

// ---- Datum ----------------------------------------------------------------

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  return addDays(iso, -((toUtc(iso).getUTCDay() + 6) % 7));
}

export function weekDays(monday: string): string[] {
  return WEEKDAYS.map((_, i) => addDays(monday, i));
}

// ISO-veckan tillhör det år dess torsdag ligger i.
export function isoWeek(iso: string): number {
  const thursday = toUtc(addDays(mondayOf(iso), 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7) + 1;
}

// Veckans måndag från ?week=, eller innevarande vecka om värdet saknas/är trasigt.
export function resolveWeek(param: string | undefined, today: string): string {
  const valid =
    param && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(toUtc(param).getTime());
  return mondayOf(valid ? param : today);
}

// Dagens datum och klockslag i Sverige, oavsett var koden kör.
export function stockholmNow(at: Date = new Date()): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// ---- Format ---------------------------------------------------------------

export function fmtMinute(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function fmtRange({ start, end }: MinuteRange): string {
  return `${fmtMinute(start)}–${fmtMinute(end)}`;
}

// "2 nov"
export function fmtDay(iso: string): string {
  const d = toUtc(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// "2–8 nov 2026", eller "30 nov – 6 dec 2026" över ett månadsskifte.
export function fmtWeekSpan(monday: string): string {
  const first = toUtc(monday);
  const sunday = addDays(monday, 6);
  const last = toUtc(sunday);
  const start =
    first.getUTCMonth() === last.getUTCMonth()
      ? `${first.getUTCDate()}–`
      : first.getUTCFullYear() === last.getUTCFullYear()
        ? `${fmtDay(monday)} – `
        : `${fmtDay(monday)} ${first.getUTCFullYear()} – `;
  return `${start}${fmtDay(sunday)} ${last.getUTCFullYear()}`;
}

// ---- Pass -----------------------------------------------------------------

export const blockRange = (b: WorkBlock): MinuteRange => ({
  start: b.start_minute,
  end: b.end_minute,
});

export const totalMinutes = (blocks: WorkBlock[]): number =>
  blocks.reduce((sum, b) => sum + (b.end_minute - b.start_minute), 0);

// Slår ihop överlappande och angränsande intervall och sorterar dem.
export function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const merged: MinuteRange[] = [];
  for (const { start, end } of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }
  return merged;
}

// De dagar en ändring påverkar och hur de ser ut efteråt. `origin` är passet som
// ändras eller tas bort (null = nytt pass), `target` dess nya läge (null = ta bort).
// `own` är den inloggades egna pass.
export function planChange(
  own: WorkBlock[],
  origin: PlacedRange | null,
  target: PlacedRange | null,
): Record<string, MinuteRange[]> {
  const rangesOn = (date: string) =>
    own.filter((b) => b.work_date === date).map(blockRange);
  const days: Record<string, MinuteRange[]> = {};
  if (origin) {
    days[origin.date] = rangesOn(origin.date).filter((r) => r.start !== origin.start);
  }
  if (target) {
    const base = days[target.date] ?? rangesOn(target.date);
    days[target.date] = mergeRanges([...base, { start: target.start, end: target.end }]);
  }
  return days;
}

// ---- Medlemmar ------------------------------------------------------------

// Hela klassnamn så att Tailwind hittar dem. Färgen följer medlemmens plats i
// listan (profiles sorterad på created_at), så att alla ser samma färg per person.
const MEMBER_COLORS = [
  { dot: "bg-teal-400", block: "bg-teal-400/25 border-teal-400 text-teal-300" },
  { dot: "bg-violet-400", block: "bg-violet-400/25 border-violet-400 text-violet-300" },
  { dot: "bg-amber-400", block: "bg-amber-400/25 border-amber-400 text-amber-300" },
  { dot: "bg-sky-400", block: "bg-sky-400/25 border-sky-400 text-sky-300" },
  { dot: "bg-pink-400", block: "bg-pink-400/25 border-pink-400 text-pink-300" },
  { dot: "bg-lime-400", block: "bg-lime-400/25 border-lime-400 text-lime-300" },
];

export const memberColor = (index: number) => MEMBER_COLORS[index % MEMBER_COLORS.length];
export const memberName = (m: Member | undefined) => m?.display_name ?? "Okänd";
