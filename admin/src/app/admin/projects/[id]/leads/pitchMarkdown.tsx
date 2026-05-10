import React from "react";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*(---+|\*\*\*+|___+)\s*$/;
const FENCE_RE = /^```/;
const BULLET_RE = /^\s*[-*+]\s+/;
const NUMBERED_RE = /^\s*\d+\.\s+/;
const QUOTE_RE = /^>/;

export type PitchSection = {
  id: string;
  title: string;
  body: string;
};

export type PitchCategory = {
  id: string;
  title: string;
  preamble: string;
  sections: PitchSection[];
};

/**
 * Parses pitch markdown into a 2-level tree:
 *   - H1 → category
 *   - H2 → section under the most recent category
 *   - text before any heading → "Introduktion" pseudo-category
 *
 * If the file uses only H2 (no H1), every H2 becomes a section under a
 * single "Pitch" category. If there are no headings at all, the whole
 * file is the preamble of one "Pitch" category.
 *
 * Horizontal rules and trailing whitespace inside section bodies are
 * preserved — the renderer handles them.
 */
export function parsePitchHierarchy(md: string): PitchCategory[] {
  if (!md.trim()) return [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  let hasH1 = false;
  let hasH2 = false;
  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (!m) continue;
    if (m[1].length === 1) hasH1 = true;
    else if (m[1].length === 2) hasH2 = true;
  }

  const categoryLevel = hasH1 ? 1 : hasH2 ? 2 : 0;
  const sectionLevel = hasH1 && hasH2 ? 2 : 0;

  const cats: PitchCategory[] = [];
  let currentCat: PitchCategory | null = null;
  let currentSec: PitchSection | null = null;
  const orphanLines: string[] = [];
  let catIdx = 0;
  let secIdx = 0;

  const closeSection = () => {
    if (currentCat && currentSec) {
      currentSec.body = currentSec.body.replace(/^\n+|\n+$/g, "");
      currentCat.sections.push(currentSec);
      currentSec = null;
    }
  };
  const closeCategory = () => {
    closeSection();
    if (currentCat) {
      currentCat.preamble = currentCat.preamble.replace(/^\n+|\n+$/g, "");
      cats.push(currentCat);
      currentCat = null;
    }
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m && categoryLevel > 0 && m[1].length === categoryLevel) {
      closeCategory();
      currentCat = {
        id: `cat-${catIdx++}`,
        title: m[2].trim(),
        preamble: "",
        sections: [],
      };
      continue;
    }
    if (m && sectionLevel > 0 && m[1].length === sectionLevel && currentCat) {
      closeSection();
      currentSec = {
        id: `sec-${secIdx++}`,
        title: m[2].trim(),
        body: "",
      };
      continue;
    }
    // Body line
    if (currentSec) currentSec.body += line + "\n";
    else if (currentCat) currentCat.preamble += line + "\n";
    else orphanLines.push(line);
  }
  closeCategory();

  // Promote orphan preamble (text before the first heading) to its own category.
  const orphanText = orphanLines.join("\n").trim();
  if (orphanText) {
    cats.unshift({
      id: "cat-intro",
      title: "Introduktion",
      preamble: orphanText,
      sections: [],
    });
  }

  if (cats.length === 0) {
    return [
      {
        id: "cat-pitch",
        title: "Pitch",
        preamble: md.trim(),
        sections: [],
      },
    ];
  }

  return cats;
}

// --- Renderer ---------------------------------------------------------

/** Render a markdown body as React nodes. Supports headings, paragraphs,
 *  bullet/numbered lists, multi-paragraph blockquotes, fenced code blocks,
 *  horizontal rules, code spans, **bold**, *italic*, and links. */
export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push(<hr key={key++} className="my-5 border-white/10" />);
      i++;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="my-3 rounded-btn bg-black/40 border border-white/5 p-3 text-xs overflow-auto"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      const level = Math.min(h[1].length, 6);
      const text = h[2];
      const cls =
        level <= 2
          ? "font-heading font-bold text-lg mt-5 mb-2"
          : level === 3
          ? "font-heading font-semibold text-sm uppercase tracking-wider text-teal-300 mt-4 mb-1.5"
          : "font-heading font-semibold text-xs uppercase tracking-wider text-[var(--muted)] mt-3 mb-1";
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(text)}
        </div>,
      );
      i++;
      continue;
    }

    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 my-3 space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        items.push(lines[i].replace(NUMBERED_RE, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 my-3 space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (QUOTE_RE.test(line)) {
      // Collect contiguous `>`-prefixed lines (including empty `>` for paragraph breaks).
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      // Split into paragraphs on empty quoted lines.
      const paragraphs: string[] = [];
      let buf: string[] = [];
      for (const ql of quoteLines) {
        if (!ql.trim()) {
          if (buf.length) {
            paragraphs.push(buf.join(" "));
            buf = [];
          }
        } else {
          buf.push(ql);
        }
      }
      if (buf.length) paragraphs.push(buf.join(" "));
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 border-l-2 border-teal-500/40 pl-4 text-white/90 italic space-y-2"
        >
          {paragraphs.map((p, idx) => (
            <p key={idx}>{renderInline(p)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Paragraph: gather contiguous non-blank lines that aren't a block start.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !NUMBERED_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2.5 leading-relaxed">
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return <>{blocks}</>;
}

/** Inline formatting: `code`, **bold**, *italic*, [link](url). */
function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let key = 0;
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) tokens.push(text.slice(lastIndex, m.index));
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
      } else tokens.push(tok);
    } else tokens.push(tok);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return <>{tokens}</>;
}
