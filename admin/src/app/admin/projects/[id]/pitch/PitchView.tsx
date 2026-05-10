"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Megaphone,
  Pencil,
  Save,
  X,
  Copy,
  Check,
  Upload,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  parsePitchHierarchy,
  renderMarkdown,
  type PitchCategory,
} from "../leads/pitchMarkdown";

export function PitchView({
  projectId,
  projectName,
  initialPitch,
}: {
  projectId: string;
  projectName: string;
  initialPitch: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pitch, setPitch] = useState(initialPitch ?? "");
  const [editing, setEditing] = useState(!initialPitch);
  const [draft, setDraft] = useState(pitch);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(0);
  const [activeSec, setActiveSec] = useState<number | null>(null); // null → category preamble
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cats: PitchCategory[] = useMemo(
    () => parsePitchHierarchy(pitch),
    [pitch],
  );

  useEffect(() => {
    if (editing) {
      setDraft(pitch);
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editing, pitch]);

  // Clamp navigation when content changes.
  useEffect(() => {
    if (activeCat >= cats.length) {
      setActiveCat(0);
      setActiveSec(null);
    } else {
      const cat = cats[activeCat];
      if (activeSec !== null && activeSec >= cat.sections.length) {
        setActiveSec(cat.sections.length > 0 ? 0 : null);
      }
    }
  }, [cats, activeCat, activeSec]);

  const currentCat = cats[Math.min(activeCat, Math.max(0, cats.length - 1))];
  const currentSec =
    currentCat && activeSec !== null
      ? currentCat.sections[activeSec] ?? null
      : null;
  const headerTitle = currentSec?.title ?? currentCat?.title ?? "";
  const breadcrumb = currentSec ? currentCat?.title : null;
  const body = currentSec?.body ?? currentCat?.preamble ?? "";

  const filteredCats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cats;
    return cats
      .map((c) => {
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchPreamble = c.preamble.toLowerCase().includes(q);
        const sections = c.sections.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.body.toLowerCase().includes(q),
        );
        if (matchTitle || matchPreamble || sections.length > 0) {
          return { ...c, sections: matchTitle ? c.sections : sections };
        }
        return null;
      })
      .filter((c): c is PitchCategory => c !== null);
  }, [cats, query]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ sales_pitch: draft.trim() ? draft : null })
        .eq("id", projectId);
      if (error) throw error;
      setPitch(draft);
      setEditing(false);
      setActiveCat(0);
      setActiveSec(null);
      router.refresh();
    } catch (err: any) {
      alert(err?.message ?? "Kunde inte spara säljpitch.");
    } finally {
      setSaving(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setDraft(text);
    } catch (err: any) {
      alert(err?.message ?? "Kunde inte läsa filen.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function toggleCollapse(catId: string) {
    setCollapsed((curr) => {
      const next = new Set(curr);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function selectCategory(idx: number) {
    setActiveCat(idx);
    const cat = cats[idx];
    setActiveSec(cat && cat.sections.length > 0 ? 0 : null);
  }
  function selectSection(catIdx: number, secIdx: number) {
    setActiveCat(catIdx);
    setActiveSec(secIdx);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link
          href={`/admin/projects/${projectId}/leads`}
          className="text-[var(--muted)] hover:text-white inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          Tillbaka till leads
        </Link>
      </div>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-1">
            {projectName}
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-3">
            <Megaphone size={24} className="text-teal-400" />
            Säljpitch
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          {!editing && pitch && (
            <button
              type="button"
              onClick={copy}
              className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm text-white inline-flex items-center gap-2"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Kopierat" : "Kopiera"}
            </button>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-2"
            >
              <Pencil size={14} />
              Redigera
            </button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <section className="glass rounded-card p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-btn border border-white/10 hover:bg-white/5 hover:border-white/20 text-white px-3 py-1.5 text-xs font-medium inline-flex items-center gap-2"
            >
              <Upload size={12} />
              Ladda upp .md
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              onChange={onPickFile}
              className="hidden"
            />
            <span className="text-[10px] text-[var(--muted)]">
              <code className="text-white/70"># Kategori</code> blir flikar i vänsterspalten,
              <code className="text-white/70 ml-1">## Scenario</code> blir sektioner under varje kategori.
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="# Kategori&#10;&#10;## Scenario&#10;Innehåll …"
            rows={24}
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white leading-relaxed font-mono"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (pitch) {
                  setEditing(false);
                  setDraft(pitch);
                } else {
                  router.back();
                }
              }}
              className="rounded-btn px-3 py-2 text-sm text-[var(--muted)] inline-flex items-center gap-2"
            >
              <X size={14} />
              Avbryt
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              <Save size={14} />
              {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </section>
      ) : !pitch ? (
        <section className="glass rounded-card p-10 text-center space-y-4">
          <Megaphone className="mx-auto text-teal-400" size={32} />
          <h2 className="font-heading font-semibold">Ingen säljpitch sparad än</h2>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Ladda upp en Markdown-fil med dina cold-call-scenarier eller skriv en pitch direkt.
            Använd <code className="text-white/80"># Kategori</code> och{" "}
            <code className="text-white/80">## Scenario</code> för att strukturera innehållet.
          </p>
          <button
            onClick={() => setEditing(true)}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold"
          >
            Kom igång
          </button>
        </section>
      ) : (
        <section className="glass rounded-card overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] min-h-[600px]">
            <aside className="border-b lg:border-b-0 lg:border-r border-white/5 bg-black/20 p-3 lg:max-h-[calc(100vh-200px)] lg:overflow-auto">
              <div className="relative mb-3">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sök i pitchen…"
                  className="w-full rounded-btn bg-black/30 border border-white/10 pl-7 pr-2 py-1.5 text-xs text-white"
                />
              </div>
              <nav className="space-y-1">
                {filteredCats.map((c) => {
                  const catIdx = cats.indexOf(c);
                  const isActiveCat = catIdx === activeCat;
                  const isCollapsed = collapsed.has(c.id);
                  const showSections =
                    !isCollapsed && (isActiveCat || query.trim().length > 0);
                  return (
                    <div key={c.id}>
                      <div
                        className={`group flex items-center gap-1 rounded-btn ${
                          isActiveCat && activeSec === null
                            ? "bg-teal-500/15 text-teal-100"
                            : "hover:bg-white/5"
                        }`}
                      >
                        {c.sections.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleCollapse(c.id)}
                            className="p-1.5 text-[var(--muted)] hover:text-white"
                            aria-label={isCollapsed ? "Visa" : "Dölj"}
                          >
                            {isCollapsed ? (
                              <ChevronRight size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                          </button>
                        ) : (
                          <span className="w-6" />
                        )}
                        <button
                          type="button"
                          onClick={() => selectCategory(catIdx)}
                          className={`flex-1 text-left py-1.5 pr-2 text-xs font-semibold uppercase tracking-wider truncate ${
                            isActiveCat && activeSec === null
                              ? "text-teal-100"
                              : "text-white"
                          }`}
                        >
                          {c.title}
                        </button>
                      </div>
                      {showSections && c.sections.length > 0 && (
                        <ul className="mt-0.5 ml-5 space-y-0.5 border-l border-white/5 pl-2">
                          {c.sections.map((s) => {
                            const secIdx = cats[catIdx].sections.indexOf(s);
                            const isActiveSec =
                              isActiveCat && activeSec === secIdx;
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  onClick={() => selectSection(catIdx, secIdx)}
                                  className={`w-full text-left rounded-btn px-2 py-1.5 text-xs transition-colors truncate block ${
                                    isActiveSec
                                      ? "bg-teal-500/15 text-teal-100"
                                      : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                                  }`}
                                >
                                  {s.title}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {filteredCats.length === 0 && (
                  <div className="text-xs text-[var(--muted)] px-2 py-3">
                    Inga träffar.
                  </div>
                )}
              </nav>
            </aside>

            <main className="p-6 lg:p-8 lg:max-h-[calc(100vh-200px)] lg:overflow-auto min-w-0">
              <div className="mb-4">
                {breadcrumb && (
                  <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-1">
                    {breadcrumb}
                  </div>
                )}
                <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                  {headerTitle}
                </h2>
              </div>
              <div className="text-sm text-white/90 max-w-3xl">
                {body.trim() ? (
                  renderMarkdown(body)
                ) : (
                  <div className="text-[var(--muted)] italic text-sm">
                    Den här sektionen är tom.
                  </div>
                )}
              </div>
            </main>
          </div>
        </section>
      )}
    </>
  );
}
