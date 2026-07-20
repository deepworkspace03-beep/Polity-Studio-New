import type { Doc, LibrarySort } from "./types";

/** Orders a document list for the Library. `size` sorts on body length
    (the document's raw source size — the honest "how big is this" proxy,
    since exported PDFs are never stored); `name` is natural/numeric-aware
    and case-insensitive. Pure and stable-input, so it's unit-tested. */
export function sortDocs(docs: Doc[], sort: LibrarySort): Doc[] {
  const dash = sort.lastIndexOf("-");
  const field = sort.slice(0, dash);
  const sign = sort.slice(dash + 1) === "asc" ? 1 : -1;
  const cmp = (a: Doc, b: Doc): number => {
    switch (field) {
      case "created":
        return a.createdAt - b.createdAt;
      case "name":
        return (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return a.body.length - b.body.length;
      default: // modified
        return a.updatedAt - b.updatedAt;
    }
  };
  return [...docs].sort((a, b) => sign * cmp(a, b));
}

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
  /** Bullet / numbered list lines — each occupies a full line however
      few words it holds, so structured notes fit far fewer words per
      page than prose (the historical −23% estimate error). */
  listItems: number;
  /** ::: callout blocks — header + padding + margins per block. */
  callouts: number;
  /** Question-dialect markers (`Q.` / `Q1.` lines) — drives the Question
      Bank page estimate, where card structure, not prose word flow,
      decides how many pages the layout really needs. */
  questions: number;
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
  const listItems = (body.match(/^\s*(?:[-*+]|\d+[.)])\s/gm) || []).length;
  const callouts = (body.match(/^:::\s*\w/gm) || []).length;
  const questions = (body.match(/^Q\d*[.)]\s/gm) || []).length;
  return { words, headings, h1s, pagebreaks, listItems, callouts, questions, readingMinutes: Math.max(1, Math.round(words / 200)) };
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
  stats: Pick<ContentStats, "words" | "headings" | "h1s" | "pagebreaks" | "listItems" | "callouts" | "questions">,
  density: "ultra" | "compact" | "comfort" | "relaxed",
  cover: boolean,
  toc: boolean,
  template?: string,
): number {
  const wpp = density === "ultra" ? 620 : density === "compact" ? 500 : density === "relaxed" ? 340 : 410;
  let body: number;
  if (template === "questions" && stats.questions > 0) {
    // Question Banks are cards, not prose: each card carries fixed layout
    // cost (header row, options grid, padding, card gap) on top of its
    // words, so a words-per-page constant lands wildly short (~50% under,
    // the "Flow says 80, Pages says 168" mismatch). Constants refit for
    // the v4.8 QB frame (tighter margins, separable options, units
    // opening on fresh pages — the heading term charges each unit's
    // average half-page rounding): measured 602 pages @1500q short-card
    // and 116 @300q solution-heavy, predicted 573/125 — inside the ±10%
    // floor browser text shaping puts under any static card constant.
    // The model assumes the default single-column layout; two-column and
    // hidden-topic banks land fewer pages, which the calibrated tier of
    // the authority chain absorbs after the first real layout.
    body = (stats.questions * 0.298 + stats.words / 1300) * (500 / wpp) + stats.headings * 0.5;
  } else {
    // Structure costs vertical space no words-per-page constant can see —
    // the old words+headings model ran ~23% short on structured study
    // notes. Grounded per-element costs, verified against real Paged.js
    // layouts at 79/193/384 pages (predictions 79/194/385): a heading ≈
    // 3 body lines (type + margins, ÷13), a list item ≈ 1.15 lines (÷34),
    // a callout ≈ 0.09 page (header + padding), a manual break or chapter
    // opening (h1 is break-before: page in Notes) wastes half a page on
    // average. Dense prose degrades gracefully to the plain words/wpp
    // model since its structural counts are ~0.
    body =
      stats.words / wpp +
      (stats.headings / 13 + stats.listItems / 34 + stats.callouts * 0.09) * (500 / wpp) +
      stats.pagebreaks * 0.5 +
      Math.max(0, stats.h1s - 1) * 0.5;
  }
  let pages = Math.max(1, Math.ceil(body));
  if (cover) pages += 1;
  if (toc) pages += 1;
  return pages;
}
