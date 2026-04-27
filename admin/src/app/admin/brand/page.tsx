import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { LogoManager } from "./LogoManager";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const supabase = await createClient();
  const { data: assets } = await supabase
    .from("brand_assets")
    .select("*")
    .order("uploaded_at", { ascending: false });

  // Sign all paths in one batch so we can render previews directly.
  const paths = (assets ?? []).map((a: any) => a.file_path);
  const previews = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("brand-assets")
      .createSignedUrls(paths, 60 * 30); // 30 min, plenty for the page lifetime
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) previews.set(row.path, row.signedUrl);
    }
  }

  const initial = (assets ?? []).map((a: any) => ({
    id: a.id,
    label: a.label,
    background: a.background ?? "light",
    file_path: a.file_path,
    mime_type: a.mime_type,
    preview_url: previews.get(a.file_path) ?? null,
  }));

  return (
    <>
      <PageHeader title="Grafisk Profil" subtitle="Triad Solutions visuella identitet." />

      <section className="glass rounded-card p-6 mb-6">
        <h2 className="font-heading text-xl font-semibold mb-4">Färgpalett</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <Swatch name="Triad Teal" hex="#00b4a8" usage="Logotyp, accent, knappar" />
          <Swatch name="Deep Navy" hex="#0a2540" usage="Bakgrunder, mörkt läge" />
          <Swatch name="Antracit" hex="#2b2d2f" usage="Brödtext, mörka ytor" />
          <Swatch name="Pure White" hex="#ffffff" usage="Bakgrunder, text mörk yta" dark />
        </div>
        <div className="mt-4 h-16 rounded-card brand-gradient grid place-items-center text-sm font-medium">
          Brand Gradient · Teal → Navy
        </div>
      </section>

      <section className="glass rounded-card p-6 mb-6">
        <h2 className="font-heading text-xl font-semibold mb-4">Typografi</h2>
        <ul className="space-y-3 text-sm">
          <li>
            <b className="font-heading">Montserrat</b> — rubriker, knappar, labels (SemiBold 600, Thin 100)
          </li>
          <li>
            <b style={{ fontFamily: "Roboto" }}>Roboto</b> — brödtext, UI-element (Regular 400, Medium 500)
          </li>
          <li>
            <b className="font-mono">JetBrains Mono</b> — kod, teknisk dokumentation
          </li>
        </ul>
      </section>

      <LogoManager initial={initial} />

      <section className="glass rounded-card p-6 mt-6">
        <h2 className="font-heading text-xl font-semibold mb-4">Spacing & form</h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="text-[var(--muted)] uppercase tracking-wider text-xs mb-2">Spacing (8px grid)</h3>
            <ul className="space-y-1">
              <li>xs — 4px · badges</li>
              <li>sm — 8px · ikoner/text</li>
              <li>md — 16px · kort, sektioner</li>
              <li>lg — 32px · sektioner</li>
              <li>xl — 64px · sidmarginaler</li>
            </ul>
          </div>
          <div>
            <h3 className="text-[var(--muted)] uppercase tracking-wider text-xs mb-2">Hörnradier</h3>
            <ul className="space-y-1">
              <li>Knappar — 8px</li>
              <li>Kort — 12px</li>
              <li>Modaler — 16px</li>
              <li>Chips — 999px (pill)</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

function Swatch({
  name,
  hex,
  usage,
  dark,
}: {
  name: string;
  hex: string;
  usage: string;
  dark?: boolean;
}) {
  return (
    <div>
      <div
        className="rounded-card h-20"
        style={{ background: hex, border: dark ? "1px solid rgba(255,255,255,0.1)" : undefined }}
      />
      <div className="mt-2 text-sm font-medium">{name}</div>
      <div className="font-mono text-xs text-[var(--muted)]">{hex}</div>
      <div className="text-xs text-[var(--muted)] mt-1">{usage}</div>
    </div>
  );
}
