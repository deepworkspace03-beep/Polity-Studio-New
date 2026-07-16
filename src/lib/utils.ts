export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Joins class names, skipping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function downloadFile(name: string, content: string | Blob, type = "application/octet-stream"): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface ContentStats {
  words: number;
  headings: number;
  /** Chapter headings (# …) — each opens a fresh page in Notes. */
  h1s: number;
  /** Manual \pagebreak / \newpage lines. */
  pagebreaks: number;
  readingMinutes: number;
}

/** Counts words, headings, chapter/page breaks and estimated reading
    time for a markdown body — one scan, shared by the header stats and
    the page estimator. */
export function contentStats(body: string): ContentStats {
  const words = (body.match(/[\p{L}\p{N}]+/gu) || []).length;
  const headings = (body.match(/^#{1,6}\s/gm) || []).length;
  const h1s = (body.match(/^#\s/gm) || []).length;
  const pagebreaks = (body.match(/^\\(pagebreak|newpage)\s*$/gm) || []).length;
  return { words, headings, h1s, pagebreaks, readingMinutes: Math.max(1, Math.round(words / 200)) };
}

/** Rough page-count estimate for the navigation readouts (editor
    scrollbar, flow preview) — the *fallback* tier of the page-count
    authority chain. The exact count only exists after Paged.js lays the
    document out; whenever a pagination has run, the workspace shows that
    real count (see Editor.tsx) and this heuristic is not consulted.
    Words-per-page is tuned per density, headings and forced breaks add
    their structural cost, plus a page each for cover and contents —
    deliberately labelled "≈" everywhere it surfaces. */
export function estimatePages(
  stats: Pick<ContentStats, "words" | "headings" | "h1s" | "pagebreaks">,
  density: "ultra" | "compact" | "comfort" | "relaxed",
  cover: boolean,
  toc: boolean,
): number {
  const wpp = density === "ultra" ? 620 : density === "compact" ? 500 : density === "relaxed" ? 340 : 410;
  // Every heading costs vertical rhythm (~1/18 page); a manual break or a
  // chapter opening wastes half a page on average.
  const structural = stats.headings / 18 + stats.pagebreaks * 0.5 + Math.max(0, stats.h1s - 1) * 0.5;
  let pages = Math.max(1, Math.ceil(stats.words / wpp + structural));
  if (cover) pages += 1;
  if (toc) pages += 1;
  return pages;
}
