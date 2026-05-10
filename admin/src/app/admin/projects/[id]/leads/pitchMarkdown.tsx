import React from "react";

export type PitchTab = { title: string; body: string };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Splits a markdown pitch into tabs by its dominant top-level heading.
 *
 * Picks the *highest* heading level present (e.g. `#` if any exist, else `##`)
 * so a file with a single `# Title` followed by `## Section` rows tabs by
 * section and shows the title text in the preamble. Content before the first
 * heading is preserved as an "Introduktion" tab.
 */
export function parsePitchMarkdown(md: string): PitchTab[] {
  if (!md.trim()) return [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  // Find the most common shallow heading level — skipping a single leading
  // top-level heading if there are deeper ones below it.
  const levels = lines
    .map((l) => l.match(HEADING_RE))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => m[1].length);

  if (levels.length === 0) {
    return [{ title: "Pitch", body: md.trim() }];
  }

  const counts = new Map<number, number>();
  for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1);
  // Prefer the level that appears most. If tied, prefer shallower.
  let primary = -1;
  let best = -1;
  for (const [lvl, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > best) {
      best = n;
      primary = lvl;
    }
  }

  // If the primary level only appears once but a deeper level appears more,
  // use the deeper one (e.g. one `# Title`, many `## Section`).
  if (counts.get(primary) === 1) {
    let alt = primary;
    for (const [lvl, n] of counts) {
      if (lvl > primary && n > 1 && n >= (counts.get(alt) ?? 0)) alt = lvl;
    }
    if (alt !== primary) primary = alt;
  }

  const tabs: PitchTab[] = [];
  let current: PitchTab | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m && m[1].length === primary) {
      if (current) {
        current.body = current.body.trimEnd();
        tabs.push(current);
      }
      current = { title: m[2].trim(), body: "" };
    } else {
      if (current) current.body += line + "\n";
      else preamble.push(line);
    }
  }
  if (current) {
    current.body = current.body.trimEnd();
    tabs.push(current);
  }

  const preambleText = preamble.join("\n").trim();
  if (preambleText) {
    // Strip a single leading top-level heading from the preamble; otherwise
    // include it as an "Introduktion" tab.
    const stripped = preambleText.replace(/^#{1,6}\s+.+$/m, "").trim();
    if (stripped) {
      tabs.unshift({ title: "Introduktion", body: stripped });
    }
  }

  return tabs.length > 0 ? tabs : [{ title: "Pitch", body: md.trim() }];
}

// --- Renderer ---------------------------------------------------------

/** Render a markdown body as React nodes. Supports headings, paragraphs,
 *  bullet/numbered lists, blockquotes, code spans, **bold**, *italic*, and links. */
export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines.
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading.
    const h = line.match(HEADING_RE);
    if (h) {
      const level = Math.min(h[1].length, 6);
      const text = h[2];
      const cls =
        level <= 2
          ? "font-heading font-bold text-base mt-4 mb-2"
          : level === 3
          ? "font-heading font-semibold text-sm uppercase tracking-wider text-[var(--muted)] mt-3 mb-1.5"
          : "font-heading font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mt-2 mb-1";
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(text)}
        </div>,
      );
      i++;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 my-2 space-y-1">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 my-2 space-y-1">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-teal-500/40 pl-3 my-2 text-[var(--muted)] italic"
        >
          {renderInline(quoted.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Paragraph: gather contiguous non-blank lines that aren't list/heading.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2 whitespace-pre-wrap">
        {renderInline(para.join("\n"))}
      </p>,
    );
  }

  return <>{blocks}</>;
}

/** Inline formatting: **bold**, *italic*, `code`, [link](url). */
function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let key = 0;
  // Combined regex for: code, bold, italic, link.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push(text.slice(lastIndex, m.index));
    }
    const tok = m[0];
    if (tok.startsWith("`")) {
      tokens.push(
        <code
          key={key++}
          className="rounded bg-white/10 px-1 py-0.5 text-[0.85em] font-mono"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      tokens.push(
        <strong key={key++} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("*")) {
      tokens.push(
        <em key={key++} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    } else if (tok.startsWith("[")) {
      const linkMatch = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        tokens.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-teal-300 hover:text-teal-200 underline"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        tokens.push(tok);
      }
    } else {
      tokens.push(tok);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return <>{tokens}</>;
}
