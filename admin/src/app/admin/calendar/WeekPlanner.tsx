"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import {
  DAY_MINUTES,
  SLOT_MINUTES,
  WEEKDAYS,
  addDays,
  blockRange,
  fmtDay,
  fmtMinute,
  fmtMinutes,
  fmtRange,
  fmtWeekSpan,
  isoWeek,
  memberColor,
  memberName,
  planChange,
  stockholmNow,
  totalMinutes,
  weekDays,
  type Member,
  type MinuteRange,
  type PlacedRange,
  type WorkBlock,
} from "@/lib/work-plan";

const SLOT_HEIGHT = 12; // px per kvart
const HOUR_HEIGHT = (SLOT_HEIGHT * 60) / SLOT_MINUTES;
const GRID_HEIGHT = (SLOT_HEIGHT * DAY_MINUTES) / SLOT_MINUTES;
const GUTTER_WIDTH = 48;
const INITIAL_HOUR = 7;
const AUTOSCROLL_EDGE = 24;
const AUTOSCROLL_STEP = 4; // px per frame, ca 5 timmar i sekunden
const LABELLED_HEIGHT = 24; // lägre pass än så här får ingen text

const HOUR_LABELS = Array.from({ length: 23 }, (_, i) => i + 1);
const TIME_OPTIONS = Array.from(
  { length: DAY_MINUTES / SLOT_MINUTES + 1 },
  (_, i) => i * SLOT_MINUTES,
);

// Linjer för timme, halvtimme och kvart. Bakgrund i stället för 96 × 7 element.
const GRID_LINES = {
  backgroundImage: [
    "linear-gradient(to bottom, rgb(var(--fg-rgb) / 0.1) 1px, transparent 1px)",
    "linear-gradient(to bottom, rgb(var(--fg-rgb) / 0.05) 1px, transparent 1px)",
    "linear-gradient(to bottom, rgb(var(--fg-rgb) / 0.02) 1px, transparent 1px)",
  ].join(","),
  backgroundSize: `100% ${HOUR_HEIGHT}px, 100% ${HOUR_HEIGHT / 2}px, 100% ${SLOT_HEIGHT}px`,
};

const toPx = (minutes: number) => (minutes / SLOT_MINUTES) * SLOT_HEIGHT;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type DragKind = "create" | "move" | "resize-start" | "resize-end";
type Drag = PlacedRange & {
  kind: DragKind;
  origin: PlacedRange | null; // passet som ändras, null när ett nytt skapas
  anchor: number; // create: första kvarten. move: var i passet man tog tag.
  moved: boolean; // false = ett klick, öppnar formuläret i stället
};
type Editing = { origin: PlacedRange | null; value: PlacedRange };

export function WeekPlanner({
  monday,
  today,
  userId,
  members,
  initialBlocks,
}: {
  monday: string;
  today: string;
  userId: string;
  members: Member[];
  initialBlocks: WorkBlock[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const days = useMemo(() => weekDays(monday), [monday]);

  const [blocks, setBlocks] = useState(initialBlocks);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ date: string; slot: number } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<{ date: string; minute: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pointerType = useRef("");
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingWrites = useRef(0);

  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  // Färsk data från servern (veckobyte, refresh), men inte mitt i en sparning.
  useEffect(() => {
    if (pendingWrites.current === 0) setBlocks(initialBlocks);
  }, [initialBlocks]);

  // Någon annan kan ha planerat medan fliken låg i bakgrunden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  useEffect(() => {
    const tick = () => setNow(stockholmNow());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = INITIAL_HOUR * HOUR_HEIGHT;
    // På telefon får inte hela veckan plats: börja på dagens kolumn.
    const todayIndex = days.indexOf(today);
    if (todayIndex > 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = ((el.scrollWidth - GUTTER_WIDTH) / days.length) * todayIndex;
    }
    // Bara vid första visningen; veckobyte ska behålla scrollläget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slotAt = (clientY: number) => {
    const top = gridRef.current?.getBoundingClientRect().top ?? 0;
    const slot = Math.floor((clientY - top) / SLOT_HEIGHT) * SLOT_MINUTES;
    return clamp(slot, 0, DAY_MINUTES - SLOT_MINUTES);
  };

  const dayAt = (clientX: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return days[0];
    const index = Math.floor((clientX - rect.left) / (rect.width / days.length));
    return days[clamp(index, 0, days.length - 1)];
  };

  function trackPointer() {
    const d = dragRef.current;
    if (!d) return;
    const slot = slotAt(pointer.current.y);
    const next = { ...d };
    if (d.kind === "create") {
      next.start = Math.min(d.anchor, slot);
      next.end = Math.max(d.anchor, slot) + SLOT_MINUTES;
      next.moved = d.moved || slot !== d.anchor;
    } else if (d.kind === "resize-start") {
      next.start = Math.min(slot, d.end - SLOT_MINUTES);
      next.moved = d.moved || next.start !== d.origin?.start;
    } else if (d.kind === "resize-end") {
      next.end = Math.max(slot + SLOT_MINUTES, d.start + SLOT_MINUTES);
      next.moved = d.moved || next.end !== d.origin?.end;
    } else {
      const length = d.end - d.start;
      next.start = clamp(slot - d.anchor, 0, DAY_MINUTES - length);
      next.end = next.start + length;
      next.date = dayAt(pointer.current.x);
      next.moved = d.moved || next.start !== d.origin?.start || next.date !== d.origin?.date;
    }
    if (next.start !== d.start || next.end !== d.end || next.date !== d.date || next.moved !== d.moved) {
      setDrag(next);
    }
  }

  // Under en drag: scrolla när pekaren är nära kanten, Esc avbryter.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const tick = () => {
      const el = scrollRef.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const top = box.top + (headerRef.current?.offsetHeight ?? 0) + AUTOSCROLL_EDGE;
        const y = pointer.current.y;
        const delta = y < top ? -AUTOSCROLL_STEP : y > box.bottom - AUTOSCROLL_EDGE ? AUTOSCROLL_STEP : 0;
        if (delta) {
          el.scrollTop += delta;
          trackPointer();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function beginDrag(e: React.PointerEvent, next: Drag) {
    gridRef.current?.setPointerCapture(e.pointerId);
    pointer.current = { x: e.clientX, y: e.clientY };
    setHover(null);
    setDrag(next);
  }

  // Touch drar aldrig: fingret ska kunna scrolla, ett tryck öppnar formuläret (onClick).
  function onGridPointerDown(e: React.PointerEvent) {
    pointerType.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    const slot = slotAt(e.clientY);
    beginDrag(e, {
      kind: "create",
      date: dayAt(e.clientX),
      start: slot,
      end: slot + SLOT_MINUTES,
      origin: null,
      anchor: slot,
      moved: false,
    });
  }

  function onBlockPointerDown(e: React.PointerEvent, placed: PlacedRange, kind: DragKind) {
    e.stopPropagation();
    pointerType.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    beginDrag(e, {
      ...placed,
      kind,
      origin: placed,
      anchor: slotAt(e.clientY) - placed.start,
      moved: false,
    });
  }

  function onGridPointerMove(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY };
    if (dragRef.current) {
      trackPointer();
    } else if (e.pointerType === "mouse") {
      const date = dayAt(e.clientX);
      const slot = slotAt(e.clientY);
      if (hover?.date !== date || hover?.slot !== slot) setHover({ date, slot });
    }
  }

  function finishDrag() {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (d.moved) {
      save(d.origin, { date: d.date, start: d.start, end: d.end });
    } else if (d.origin) {
      setEditing({ origin: d.origin, value: d.origin });
    } else {
      openNew(d.date, d.anchor);
    }
  }

  function onGridClick(e: React.MouseEvent) {
    if (pointerType.current === "touch") openNew(dayAt(e.clientX), slotAt(e.clientY));
  }

  function openNew(date: string, start: number) {
    setEditing({
      origin: null,
      value: { date, start, end: Math.min(start + 60, DAY_MINUTES) },
    });
  }

  function save(origin: PlacedRange | null, target: PlacedRange | null) {
    const unchanged =
      origin && target &&
      origin.date === target.date && origin.start === target.start && origin.end === target.end;
    if (unchanged) return;

    const changed = planChange(blocks.filter((b) => b.profile_id === userId), origin, target);
    setBlocks((prev) => [
      ...prev.filter((b) => !(b.profile_id === userId && b.work_date in changed)),
      ...Object.entries(changed).flatMap(([date, ranges]) =>
        ranges.map((r) => ({
          profile_id: userId,
          work_date: date,
          start_minute: r.start,
          end_minute: r.end,
        })),
      ),
    ]);
    setError(null);

    const p_days = Object.fromEntries(
      Object.entries(changed).map(([date, ranges]) => [date, ranges.map((r) => [r.start, r.end])]),
    );
    // I tur och ordning: varje anrop skriver hela dagen, så ordningen avgör slutresultatet.
    pendingWrites.current += 1;
    writeQueue.current = writeQueue.current.then(async () => {
      const { error: rpcError } = await supabase.rpc("save_work_plan", { p_days });
      pendingWrites.current -= 1;
      if (rpcError) setError(`Kunde inte spara: ${rpcError.message}`);
      if (pendingWrites.current === 0) router.refresh();
    });
  }

  const blocksByDate = useMemo(() => {
    const map = new Map<string, WorkBlock[]>();
    for (const b of blocks) {
      if (!map.has(b.work_date)) map.set(b.work_date, []);
      map.get(b.work_date)!.push(b);
    }
    return map;
  }, [blocks]);

  // En fast plats per person hela veckan, jag själv först. Bara de som planerat
  // något den här veckan tar plats, så att ett ensamt schema får hela bredden.
  const laneIds = useMemo(() => {
    const planned = new Set(blocks.map((b) => b.profile_id));
    return [userId, ...members.map((m) => m.id).filter((id) => id !== userId && planned.has(id))];
  }, [blocks, members, userId]);

  const colorOf = (id: string) =>
    memberColor(Math.max(members.findIndex((m) => m.id === id), 0));

  const laneStyle = (range: MinuteRange, lane: number) => ({
    top: toPx(range.start),
    height: toPx(range.end - range.start) - 1,
    left: `calc(${(lane / laneIds.length) * 100}% + 1px)`,
    width: `calc(${100 / laneIds.length}% - 2px)`,
  });

  const currentDate = now?.date ?? today;
  const gridCursor =
    drag?.kind === "move"
      ? "cursor-grabbing"
      : drag?.kind === "resize-start" || drag?.kind === "resize-end"
        ? "cursor-ns-resize"
        : "cursor-crosshair";

  return (
    <div className="glass rounded-xl border border-white/10 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div>
          <h2 className="font-heading text-sm sm:text-lg font-bold">Vecka {isoWeek(monday)}</h2>
          <div className="text-xs text-[var(--muted)]">{fmtWeekSpan(monday)}</div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/calendar?week=${addDays(monday, -7)}`}
            scroll={false}
            aria-label="Föregående vecka"
            className="p-2 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href="/admin/calendar"
            scroll={false}
            className="px-3 py-2 rounded-btn text-xs sm:text-sm hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            Idag
          </Link>
          <Link
            href={`/admin/calendar?week=${addDays(monday, 7)}`}
            scroll={false}
            aria-label="Nästa vecka"
            className="p-2 rounded-btn hover:bg-white/5 text-[var(--muted)] hover:text-white"
          >
            <ChevronRight size={16} />
          </Link>
          <button
            type="button"
            onClick={() =>
              setEditing({
                origin: null,
                value: { date: days.includes(today) ? today : monday, start: 9 * 60, end: 17 * 60 },
              })
            }
            className="ml-2 rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-3 py-2 text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={15} />
            Lägg till tid
          </button>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 sm:px-4 pb-3 text-xs">
        {members.map((m, i) => (
          <li key={m.id} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${memberColor(i).dot}`} />
            <span>
              {memberName(m)}
              {m.id === userId && <span className="text-[var(--muted)]"> (du)</span>}
            </span>
            <span className="text-[var(--muted)] tabular-nums">
              {fmtMinutes(totalMinutes(blocks.filter((b) => b.profile_id === m.id)))}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <div className="mx-3 sm:mx-4 mb-3 rounded-btn border border-rose-400/30 bg-rose-400/10 text-rose-300 text-xs px-3 py-2">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-auto h-[calc(100dvh-15rem)] min-h-[420px] border-t border-white/10"
      >
        {/* Bredare dagar på telefon: tre personers pass får plats med läsbar tid. */}
        <div className="min-w-[980px] lg:min-w-[720px]">
          <div ref={headerRef} className="sticky top-0 z-30 flex bg-[var(--surface)] border-b border-white/10">
            <div
              className="shrink-0 sticky left-0 z-10 bg-[var(--surface)]"
              style={{ width: GUTTER_WIDTH }}
            />
            <div className="flex-1 grid grid-cols-7">
              {days.map((date, i) => {
                const mine = totalMinutes(
                  (blocksByDate.get(date) ?? []).filter((b) => b.profile_id === userId),
                );
                return (
                  <div key={date} className="py-1.5 text-center border-l border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {WEEKDAYS[i]}
                    </div>
                    <div
                      className={`mx-auto mt-0.5 h-6 w-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                        date === currentDate ? "bg-teal-400 text-fixed-black" : ""
                      }`}
                    >
                      {Number(date.slice(8))}
                    </div>
                    <div
                      className="mt-0.5 h-3 text-[10px] leading-3 text-[var(--muted)] tabular-nums"
                      title="Din planerade tid"
                    >
                      {mine > 0 && fmtMinutes(mine)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex">
            <div
              className="shrink-0 sticky left-0 z-20 bg-[var(--surface)]"
              style={{ width: GUTTER_WIDTH, height: GRID_HEIGHT }}
            >
              {HOUR_LABELS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-[var(--muted)] tabular-nums"
                  style={{ top: h * HOUR_HEIGHT }}
                >
                  {fmtMinute(h * 60)}
                </div>
              ))}
            </div>

            <div
              ref={gridRef}
              className={`relative flex-1 grid grid-cols-7 select-none ${gridCursor}`}
              style={{ height: GRID_HEIGHT, ...GRID_LINES }}
              onPointerDown={onGridPointerDown}
              onPointerMove={onGridPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              onPointerLeave={() => setHover(null)}
              onClick={onGridClick}
            >
              {days.map((date) => (
                <div
                  key={date}
                  className={`relative border-l border-white/5 ${
                    date === currentDate ? "bg-teal-400/[0.04]" : ""
                  }`}
                >
                  {hover?.date === date && !drag && (
                    <div
                      className="absolute inset-x-0 bg-white/5 px-1 text-[9px] leading-3 text-[var(--muted)] tabular-nums pointer-events-none"
                      style={{ top: toPx(hover.slot), height: SLOT_HEIGHT }}
                    >
                      {fmtMinute(hover.slot)}
                    </div>
                  )}

                  {(blocksByDate.get(date) ?? []).map((b) => {
                    const range = blockRange(b);
                    const placed = { date, ...range };
                    const lane = laneIds.indexOf(b.profile_id);
                    const length = range.end - range.start;
                    const labelled = toPx(length) >= LABELLED_HEIGHT;
                    const color = colorOf(b.profile_id).block;
                    const key = `${b.profile_id}-${b.start_minute}`;

                    if (b.profile_id !== userId) {
                      // Andras pass går inte att ändra. Pekaren bubblar vidare till
                      // griden, så man kan börja dra sitt eget pass rakt över dem.
                      const name = memberName(members.find((m) => m.id === b.profile_id));
                      return (
                        <div
                          key={key}
                          title={`${name} · ${fmtRange(range)} · ${fmtMinutes(length)}`}
                          style={laneStyle(range, lane)}
                          className={`absolute rounded border-l-2 overflow-hidden px-1 py-0.5 text-[10px] leading-3 opacity-80 ${color}`}
                        >
                          {labelled && <div className="font-medium tabular-nums">{fmtRange(range)}</div>}
                        </div>
                      );
                    }

                    if (drag?.origin?.date === date && drag.origin.start === range.start) return null;

                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ändra ${fmtRange(range)}`}
                        title={`${fmtRange(range)} · ${fmtMinutes(length)}`}
                        style={laneStyle(range, lane)}
                        className={`absolute rounded border-l-2 overflow-hidden px-1 py-0.5 text-[10px] leading-3 cursor-grab ring-focus ${color}`}
                        onPointerDown={(e) => onBlockPointerDown(e, placed, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pointerType.current === "touch") setEditing({ origin: placed, value: placed });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setEditing({ origin: placed, value: placed });
                          }
                        }}
                      >
                        {labelled && <div className="font-medium tabular-nums">{fmtRange(range)}</div>}
                        {labelled && (
                          <span
                            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                            onPointerDown={(e) => onBlockPointerDown(e, placed, "resize-start")}
                          />
                        )}
                        <span
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                          onPointerDown={(e) => onBlockPointerDown(e, placed, "resize-end")}
                        />
                      </div>
                    );
                  })}

                  {drag?.date === date && (
                    <div
                      style={laneStyle(drag, 0)}
                      className={`absolute z-10 rounded border-l-2 px-1 text-[10px] leading-3 whitespace-nowrap ring-1 ring-white/30 shadow-lg pointer-events-none ${colorOf(userId).block}`}
                    >
                      <div className="font-semibold tabular-nums">{fmtRange(drag)}</div>
                      <div className="opacity-80">{fmtMinutes(drag.end - drag.start)}</div>
                    </div>
                  )}

                  {now?.date === date && (
                    <div
                      className="absolute inset-x-0 z-10 h-px bg-rose-400 pointer-events-none"
                      style={{ top: toPx(now.minute) }}
                    >
                      <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-rose-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <BlockEditor
          editing={editing}
          days={days}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            save(editing.origin, value);
            setEditing(null);
          }}
          onDelete={() => {
            save(editing.origin, null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function BlockEditor({
  editing,
  days,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing;
  days: string[];
  onClose: () => void;
  onSave: (value: PlacedRange) => void;
  onDelete: () => void;
}) {
  const [date, setDate] = useState(editing.value.date);
  const [start, setStart] = useState(editing.value.start);
  const [end, setEnd] = useState(editing.value.end);
  const selectClass = "w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm";
  const labelClass = "text-xs uppercase tracking-wider text-[var(--muted)]";

  return (
    <Modal open onClose={onClose} sheet>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ date, start, end });
        }}
        className="w-full sm:max-w-sm glass rounded-t-modal sm:rounded-modal p-6 space-y-4"
      >
        <h3 className="font-heading text-lg font-semibold">
          {editing.origin ? "Ändra tid" : "Ny tid"}
        </h3>
        <label className="block space-y-1.5">
          <span className={labelClass}>Dag</span>
          <select value={date} onChange={(e) => setDate(e.target.value)} className={selectClass}>
            {days.map((d, i) => (
              <option key={d} value={d}>
                {WEEKDAYS[i]} {fmtDay(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={labelClass}>Från</span>
            <select
              value={start}
              onChange={(e) => {
                const next = Number(e.target.value);
                setStart(next);
                if (next >= end) setEnd(Math.min(next + 60, DAY_MINUTES));
              }}
              className={selectClass}
            >
              {TIME_OPTIONS.filter((m) => m < DAY_MINUTES).map((m) => (
                <option key={m} value={m}>{fmtMinute(m)}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Till</span>
            <select
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              className={selectClass}
            >
              {TIME_OPTIONS.filter((m) => m > start).map((m) => (
                <option key={m} value={m}>{fmtMinute(m)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-[var(--muted)]">Totalt {fmtMinutes(end - start)}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          {editing.origin ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-btn px-3 py-2 text-sm text-rose-300 hover:bg-rose-400/10 flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Ta bort
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">
              Avbryt
            </button>
            <button type="submit" className="rounded-btn bg-[var(--triad-teal)] text-fixed-black px-4 py-2 text-sm font-medium">
              Spara
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
