#!/usr/bin/env node
// One-time seed: upload logos from admin/public/logos/ into the
// 'brand-assets' Supabase Storage bucket and create matching rows
// in public.brand_assets.
//
// Usage:
//   cd admin
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed-brand-assets.mjs
//
// The service role key is required because we need to bypass RLS
// (the storage policies require an authenticated session) and
// because the storage bucket is private. Get the key from
// Supabase Dashboard → Project Settings → API.
//
// Re-running is safe: if a row with the same label already exists,
// the file is skipped.

import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.",
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(__dirname, "../public/logos");

/** @type {Array<{file: string, label: string, background: 'light'|'dark'|'color', mime: string}>} */
const LOGOS = [
  { file: "Logo.svg",                   label: "Logo (SVG)",        background: "color", mime: "image/svg+xml" },
  { file: "Logo_Black_Icon.png",        label: "Svart ikon",        background: "light", mime: "image/png" },
  { file: "Logo_Black_with_text.png",   label: "Svart med text",    background: "light", mime: "image/png" },
  { file: "Logo_Color_Icon.png",        label: "Färg ikon",         background: "color", mime: "image/png" },
  { file: "Logo_Color_with_text.png",   label: "Färg med text",     background: "color", mime: "image/png" },
  { file: "Logo_White_Icon.png",        label: "Vit ikon",          background: "dark",  mime: "image/png" },
  { file: "Logo_White_with_text.png",   label: "Vit med text",      background: "dark",  mime: "image/png" },
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing, error: existingErr } = await supabase
    .from("brand_assets")
    .select("label");
  if (existingErr) throw existingErr;
  const existingLabels = new Set((existing ?? []).map((r) => r.label));

  let uploaded = 0;
  let skipped = 0;

  for (const logo of LOGOS) {
    if (existingLabels.has(logo.label)) {
      console.log(`SKIP  ${logo.label} (row already exists)`);
      skipped++;
      continue;
    }

    const localPath = path.join(LOGOS_DIR, logo.file);
    let body;
    try {
      body = await readFile(localPath);
    } catch {
      console.warn(`MISS  ${logo.file} not found at ${localPath}; skipping`);
      continue;
    }

    const storagePath = `seed/${logo.file}`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(storagePath, body, {
        contentType: logo.mime,
        upsert: true,
      });
    if (upErr) {
      console.error(`FAIL  ${logo.file}: ${upErr.message}`);
      continue;
    }

    const { error: insErr } = await supabase.from("brand_assets").insert({
      label: logo.label,
      background: logo.background,
      file_path: storagePath,
      mime_type: logo.mime,
    });
    if (insErr) {
      console.error(`FAIL  inserting row for ${logo.label}: ${insErr.message}`);
      continue;
    }

    console.log(`OK    ${logo.label} → ${storagePath}`);
    uploaded++;
  }

  console.log(`\nDone. Uploaded ${uploaded}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
