"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Megaphone,
  Pencil,
  Save,
  X,
  Copy,
  Check,
  Upload,
  FileText,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { parsePitchMarkdown, renderMarkdown, type PitchTab } from "./pitchMarkdown";

export function SalesPitchButton({
  projectId,
  initialPitch,
}: {
  projectId: string;
  initialPitch: string | null;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState(initialPitch ?? "");
  const [editing, setEditing] = useState(!initialPitch);
  const [draft, setDraft] = useState(pitch);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs: PitchTab[] = useMemo(() => parsePitchMarkdown(pitch), [pitch]);

  useEffect(() => {
    if (activeTab >= tabs.length) setActiveTab(0);
  }, [tabs.length, activeTab]);

  useEffect(() => {
    if (open && editing) {
      setDraft(pitch);
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, editing, pitch]);

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
      setActiveTab(0);
    } catch (err: any) {
      alert(err?.message ?? "Kunde inte spara säljpitch.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    const target = tabs.length > 1 ? tabs[activeTab]?.body ?? pitch : pitch;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
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

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setEditing(!pitch);
          setActiveTab(0);
        }}
        className="rounded-btn border border-white/10 hover:bg-white/5 hover:border-white/20 text-white px-3 py-1.5 text-sm font-medium flex items-center gap-2 transition-colors"
      >
        <Megaphone size={14} />
        Säljpitch
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
                <Megaphone size={18} className="text-teal-400" />
                Säljpitch
              </h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                Ladda upp en Markdown-fil — varje rubrik blir en flik.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-btn text-[var(--muted)] hover:text-white hover:bg-white/5"
              aria-label="Stäng"
            >
              <X size={16} />
            </button>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
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
                  Tips: använd <code className="text-white/70">## Rubrik</code> för varje scenario.
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="# Pitch&#10;&#10;## Öppning&#10;Hej, det är …&#10;&#10;## Invändning – för dyrt&#10;Jag förstår …"
                rows={16}
                className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white leading-relaxed font-mono"
              />
              {draft && (
                <PitchPreview
                  tabs={parsePitchMarkdown(draft)}
                  activeTab={activeTab}
                  onTab={setActiveTab}
                  compact
                />
              )}
            </div>
          ) : pitch ? (
            <PitchPreview
              tabs={tabs}
              activeTab={activeTab}
              onTab={setActiveTab}
            />
          ) : (
            <div className="rounded-btn border border-dashed border-white/10 p-6 text-center text-xs text-[var(--muted)]">
              Ingen säljpitch sparad än.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (pitch) {
                      setEditing(false);
                      setDraft(pitch);
                    } else {
                      setOpen(false);
                    }
                  }}
                  className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
                >
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
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={copy}
                  disabled={!pitch}
                  className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied
                    ? "Kopierat"
                    : tabs.length > 1
                    ? "Kopiera flik"
                    : "Kopiera"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Pencil size={14} />
                  Redigera
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function PitchPreview({
  tabs,
  activeTab,
  onTab,
  compact = false,
}: {
  tabs: PitchTab[];
  activeTab: number;
  onTab: (i: number) => void;
  compact?: boolean;
}) {
  if (tabs.length === 0) {
    return (
      <div className="rounded-btn border border-dashed border-white/10 p-6 text-center text-xs text-[var(--muted)]">
        Tom pitch.
      </div>
    );
  }

  const active = tabs[Math.min(activeTab, tabs.length - 1)];

  return (
    <div className="space-y-3">
      {compact && (
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Förhandsvisning
        </div>
      )}
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/5 pb-3">
          {tabs.map((t, i) => {
            const isActive = i === activeTab;
            return (
              <button
                key={i}
                onClick={() => onTab(i)}
                className={`rounded-btn px-3 py-1.5 text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  isActive
                    ? "bg-teal-500/15 text-teal-100 border-teal-500/30"
                    : "border-white/5 text-[var(--muted)] hover:text-white hover:bg-white/5"
                }`}
              >
                <FileText size={12} />
                {t.title}
              </button>
            );
          })}
        </div>
      )}
      <div
        className={`rounded-btn bg-black/20 border border-white/5 p-4 text-sm text-white leading-relaxed ${
          compact ? "max-h-64 overflow-auto" : ""
        }`}
      >
        {renderMarkdown(active.body)}
      </div>
    </div>
  );
}
