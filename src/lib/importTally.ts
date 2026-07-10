/**
 * Shared "what did the conversion do" bookkeeping — one tally shape and
 * summary formatter used by every import path (HTML clipboard, HTML/DOCX
 * files) so the toast wording stays consistent. Split out of importer.ts
 * so the DOCX reader can reuse it without an importer.ts ⇄ docx.ts
 * circular import.
 */

export interface Tally {
  headings: number;
  listItems: number;
  tables: number;
  quotes: number;
  codeBlocks: number;
  links: number;
  imagesDropped: number;
}

export const newTally = (): Tally => ({ headings: 0, listItems: 0, tables: 0, quotes: 0, codeBlocks: 0, links: 0, imagesDropped: 0 });

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function summarize(flavor: string, t: Tally): string {
  const parts: string[] = [];
  if (t.headings) parts.push(plural(t.headings, "heading"));
  if (t.listItems) parts.push(plural(t.listItems, "list item"));
  if (t.tables) parts.push(plural(t.tables, "table"));
  if (t.quotes) parts.push(plural(t.quotes, "quote"));
  if (t.codeBlocks) parts.push(plural(t.codeBlocks, "code block"));
  if (t.links) parts.push(plural(t.links, "link"));
  if (t.imagesDropped) parts.push(`${plural(t.imagesDropped, "image")} removed`);
  const detail = parts.slice(0, 3).join(", ");
  return `Converted ${flavor} to Markdown${detail ? ` — ${detail}` : ""}`;
}

/** Wraps trimmed content in a Markdown delimiter, keeping surrounding
    spaces outside so `** bold **` never happens. */
export function wrap(inner: string, mark: string): string {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!m[2] || (m[2].startsWith(mark) && m[2].endsWith(mark))) return inner;
  return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
}
