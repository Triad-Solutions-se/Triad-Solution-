"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Megaphone, Pencil, Save, X, Copy, Check } from "lucide-react";
import { Modal } from "@/components/Modal";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && editing) {
      setDraft(pitch);
      // focus on next tick so the modal has mounted
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
    } catch (err: any) {
      alert(err?.message ?? "Kunde inte spara säljpitch.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setEditing(!pitch);
        }}
        className="rounded-btn border border-white/10 hover:bg-white/5 hover:border-white/20 text-white px-3 py-1.5 text-sm font-medium flex items-center gap-2 transition-colors"
      >
        <Megaphone size={14} />
        Säljpitch
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
                <Megaphone size={18} className="text-teal-400" />
                Säljpitch
              </h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                Manuset du läser när du ringer leads för det här projektet.
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
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Skriv din säljpitch här…"
              rows={14}
              className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white leading-relaxed font-mono"
            />
          ) : pitch ? (
            <div className="rounded-btn bg-black/20 border border-white/5 p-4 text-sm text-white whitespace-pre-wrap leading-relaxed">
              {pitch}
            </div>
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
                  {copied ? "Kopierat" : "Kopiera"}
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
