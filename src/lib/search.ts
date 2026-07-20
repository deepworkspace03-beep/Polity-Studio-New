import type { Doc } from "./types";
import { searchInDocument, type DocSection } from "./docSearch";

/**
 * Universal document search. The whole corpus already lives in memory
 * (the store loads every doc at startup), so a scored linear scan is
 * simpler and plenty fast at this app's scale — no separate index to
 * build, persist or invalidate. Lower-cased fields are cached per doc
 * object; docs are replaced immutably on edit, so a WeakMap
 * self-invalidates.
 */

export interface SearchHit {
  doc: Doc;
  score: number;
  /** Context around the first body match — set for content hits only. */
  snippet?: string;
  /** 1-based body line of the first content match — deep-links the editor. */
  line?: number;
  /** Total occurrences of the query across every searched field (title +
      metadata + body), summed over tokens — powers the count badge and the
      "found in title/metadata/body" breakdown on the Library card. */
  matchCount?: number;
  /** Where the query was found, for the collapsed-card summary. */
  where?: { title: number; meta: number; body: number };
}

interface Cached {
  title: string;
  meta: string;
  body: string;
}

const cache = new WeakMap<Doc, Cached>();

function fieldsOf(doc: Doc): Cached {
  let c = cache.get(doc);
  if (!c) {
    c = {
      title: doc.title.toLowerCase(),
      meta: [doc.subtitle, doc.exam, doc.paper, doc.session, doc.author].join(" ").toLowerCase(),
      body: doc.body.toLowerCase(),
    };
    cache.set(doc, c);
  }
  return c;
}

/** Count every (case-insensitive) occurrence of `needle` in `haystack`.
    Both are expected pre-lowercased. */
function countIn(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** All query tokens must match somewhere (AND semantics); each token
    scores by the strongest field it hits. */
export function searchDocs(docs: Doc[], query: string, limit = 20): SearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const f = fieldsOf(doc);
    let score = 0;
    let bodyIdx = -1;
    let ok = true;
    // Occurrence tallies per field — every token counted everywhere it
    // appears, so the card badge and breakdown reflect real frequency, not
    // just the single field that won the score.
    let titleHits = 0;
    let metaHits = 0;
    let bodyHits = 0;
    for (const tok of tokens) {
      const inTitle = countIn(f.title, tok);
      const inMeta = countIn(f.meta, tok);
      const inBody = countIn(f.body, tok);
      if (inTitle === 0 && inMeta === 0 && inBody === 0) {
        ok = false;
        break;
      }
      titleHits += inTitle;
      metaHits += inMeta;
      bodyHits += inBody;
      if (inTitle) score += f.title.startsWith(tok) ? 40 : 25;
      else if (inMeta) score += 12;
      else score += 6;
      if (inBody) {
        const i = f.body.indexOf(tok);
        if (bodyIdx < 0 || i < bodyIdx) bodyIdx = i;
      }
    }
    if (!ok) continue;
    const hit: SearchHit = {
      doc,
      score,
      matchCount: titleHits + metaHits + bodyHits,
      where: { title: titleHits, meta: metaHits, body: bodyHits },
    };
    if (bodyIdx >= 0) {
      hit.line = lineAt(doc.body, bodyIdx);
      hit.snippet = snippetAt(doc.body, bodyIdx);
    }
    hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt).slice(0, limit);
}

/* ── Per-document breakdown (Library "where does it appear?" panel) ────
   Reuses the editor's in-document scanner (lib/docSearch.ts): each query
   token is scanned across the body, matches are grouped under the nearest
   heading section, and each group carries the source line of its first
   match so the Library can deep-link straight to it (#/edit/:id/:line).
   Body-scoped by design — title/metadata hits are shown separately from
   the SearchHit.where tallies, since those aren't editor positions. */

export interface BreakdownSection {
  /** Heading text of the section ("" = the intro before the first heading). */
  title: string;
  level: number;
  /** Estimated page the section starts on. */
  page: number;
  /** Occurrences of the query within this section. */
  count: number;
  /** 1-based source line of the first match here — the jump target. */
  matchLine: number;
}

export interface DocBreakdown {
  /** Total body occurrences across all tokens. */
  total: number;
  /** True when a token's scan hit the safety cap (very large document). */
  capped: boolean;
  sections: BreakdownSection[];
}

export function documentBreakdown(doc: Doc, query: string, estPages: number): DocBreakdown {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { total: 0, capped: false, sections: [] };
  let sections: DocSection[] = [];
  const bySection = new Map<number, { count: number; firstFrom: number; matchLine: number }>();
  let total = 0;
  let capped = false;
  for (const tok of tokens) {
    const res = searchInDocument(doc.body, tok, { estPages, caseSensitive: false });
    if (sections.length === 0) sections = res.sections;
    total += res.total;
    if (res.capped) capped = true;
    for (const m of res.matches) {
      const cur = bySection.get(m.section);
      if (!cur) bySection.set(m.section, { count: 1, firstFrom: m.from, matchLine: m.line });
      else {
        cur.count++;
        if (m.from < cur.firstFrom) {
          cur.firstFrom = m.from;
          cur.matchLine = m.line;
        }
      }
    }
  }
  const out: BreakdownSection[] = [];
  for (const [idx, c] of bySection) {
    const s = sections[idx];
    if (!s) continue;
    out.push({ title: s.title, level: s.level, page: s.page, count: c.count, matchLine: c.matchLine });
  }
  out.sort((a, b) => a.matchLine - b.matchLine);
  return { total, capped, sections: out };
}

function lineAt(body: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (body.charCodeAt(i) === 10) line++;
  return line;
}

function snippetAt(body: string, idx: number): string {
  const start = Math.max(0, idx - 32);
  const end = Math.min(body.length, idx + 64);
  const raw = body.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${raw}${end < body.length ? "…" : ""}`;
}
