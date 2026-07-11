import { plural } from "./importTally";

/**
 * Markdown review — the analysis behind Import Review's stats bar and
 * one-click cleanup. Two pure, dependency-free passes over a Markdown
 * body:
 *
 * - `reviewMarkdown` reports document statistics (words, reading time,
 *   page estimate, structure counts) and *semantic* warnings a human
 *   should judge (heading gaps, duplicate H1, an unclosed code fence,
 *   ragged tables) — the things automation shouldn't silently rewrite.
 * - `normalizeMarkdown` applies only the mechanical, reversible fixes
 *   (heading spacing, stray whitespace, excess blank lines, NBSP/zero-
 *   width junk) and reports how many it made.
 *
 * Both are fence-aware: nothing inside ``` / ~~~ code blocks is counted
 * as prose or touched by normalization, so pasted code survives intact.
 */

export interface MdReview {
  words: number;
  headings: number;
  tables: number;
  images: number;
  links: number;
  codeBlocks: number;
  readingMinutes: number;
  /** Rough page estimate for the resulting PDF — labelled "~" in the UI. */
  pages: number;
  /** How many mechanical fixes `normalizeMarkdown` would make right now. */
  fixable: number;
  /** Judgement-call issues normalization deliberately leaves to the author. */
  warnings: string[];
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+\S/;
/** A GFM header-separator row: pipes plus dashes (with optional colons). */
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Splits a body into prose lines and fenced-code spans so callers can
    reason about "real" content without a code block polluting the count. */
function eachProseLine(src: string, fn: (line: string) => void): boolean {
  let inFence = false;
  for (const line of src.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) fn(line);
  }
  return inFence; // true ⇒ a fence was opened and never closed
}

export function reviewMarkdown(src: string): MdReview {
  const text = src.replace(/\r\n?/g, "\n");
  const prose: string[] = [];
  const unclosedFence = eachProseLine(text, (l) => prose.push(l));
  const body = prose.join("\n");

  const words = (body.match(/[\p{L}\p{N}]+/gu) || []).length;
  const codeBlocks = Math.floor((text.match(/^\s*(```|~~~)/gm) || []).length / 2);
  const images = (body.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
  const links = (body.match(/(^|[^!])\[[^\]]*\]\([^)]*\)/g) || []).length;
  const tables = prose.filter((l) => TABLE_SEP.test(l)).length;

  const warnings: string[] = [];
  const levels = prose.filter((l) => HEADING.test(l)).map((l) => l.match(HEADING)![1].length);
  const headings = levels.length;
  if (levels.filter((l) => l === 1).length > 1) {
    warnings.push("More than one top-level (#) heading — a document usually has one title.");
  }
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      warnings.push(`Heading level jumps from H${levels[i - 1]} to H${levels[i]} — skipped a level.`);
      break;
    }
  }
  if (unclosedFence) warnings.push("A code fence (```) is opened but never closed.");
  if (/\[[^\]]*\]\(\s*\)/.test(body)) warnings.push("A link or image has an empty target ( ).");

  // Ragged table: a header row whose column count differs from its body.
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!TABLE_SEP.test(lines[i]) || i === 0) continue;
    const cols = (r: string) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").length;
    const header = cols(lines[i - 1]);
    let ragged = false;
    for (let j = i + 1; j < lines.length && lines[j].includes("|"); j++) {
      if (cols(lines[j]) !== header) ragged = true;
    }
    if (ragged) {
      warnings.push("A table has rows with uneven column counts.");
      break;
    }
  }

  return {
    words,
    headings,
    tables,
    images,
    links,
    codeBlocks,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    pages: Math.max(1, Math.round((words + images * 120 + tables * 60) / 320)),
    fixable: normalizeMarkdown(src).fixes,
    warnings,
  };
}

/** Applies only mechanical, reversible cleanups. Everything inside a
    fenced code block is preserved byte-for-byte. Two-space "hard break"
    line endings are converted to this app's `\` dialect rather than
    stripped, so intentional line breaks survive. */
export function normalizeMarkdown(src: string): { markdown: string; fixes: number } {
  let fixes = 0;
  let text = src.replace(/\r\n?/g, "\n");

  const zw = (text.match(/[\u200b\ufeff]/g) || []).length;
  if (zw) {
    fixes += zw;
    text = text.replace(/[\u200b\ufeff]/g, "");
  }
  const nbsp = (text.match(/\u00a0/g) || []).length;
  if (nbsp) {
    fixes += nbsp;
    text = text.replace(/\u00a0/g, " ");
  }

  const out: string[] = [];
  let inFence = false;
  let blanks = 0;
  for (const raw of text.split("\n")) {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      blanks = 0;
      continue;
    }
    if (inFence) {
      out.push(raw);
      continue;
    }

    if (raw.trim() === "") {
      blanks++;
      if (blanks > 1) fixes++; // collapse runs of blank lines to one
      else out.push("");
      continue;
    }
    blanks = 0;

    let line = raw;
    if (/\S {2,}$/.test(line)) {
      line = line.replace(/ +$/, "\\"); // preserve hard break in the app's dialect
      fixes++;
    } else if (/\s+$/.test(line)) {
      line = line.replace(/\s+$/, "");
      fixes++;
    }
    const spaced = line.replace(/^(#{1,6})([^#\s])/, "$1 $2"); // "##Heading" → "## Heading"
    if (spaced !== line) {
      fixes++;
      line = spaced;
    }
    if (/^#{1,6}\s/.test(line) && out.length && out[out.length - 1].trim() !== "") {
      out.push(""); // breathing room before a heading
      fixes++;
    }
    out.push(line);
  }

  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return { markdown: out.join("\n"), fixes };
}

/** One-line "N fixes / N warnings" phrasing for compact UI. */
export function reviewHeadline(r: MdReview): string {
  if (r.warnings.length) return plural(r.warnings.length, "thing") + " to check";
  if (r.fixable) return plural(r.fixable, "quick fix") + " available";
  return "Looks clean";
}
