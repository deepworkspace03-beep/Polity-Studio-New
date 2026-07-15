/**
 * In-document search for the editor's Search Navigator. A plain, allocation-
 * light linear scan of the *currently open* document body — never across
 * documents (that's the Ctrl+K palette's job, lib/search.ts). Matches are
 * grouped under the nearest preceding heading and tagged with an estimated
 * page number so a long note becomes navigable at a glance.
 *
 * Everything here is pure string work with no DOM or React, so it's cheap
 * to run on every keystroke and unit-testable in isolation.
 */

export interface DocSection {
  /** Heading text; "" for the implicit section before the first heading. */
  title: string;
  /** Heading level 1–6; 0 for the pre-heading section. */
  level: number;
  /** 1-based source line of the heading. */
  line: number;
  /** Estimated page the heading falls on. */
  page: number;
}

export interface DocMatch {
  /** Character offsets into the body (== CodeMirror document offsets). */
  from: number;
  to: number;
  /** 1-based source line of the match. */
  line: number;
  /** Estimated page the match falls on. */
  page: number;
  /** Index into `sections` of the group this match belongs to. */
  section: number;
  /** Single-line snippet split around the match for safe highlighting. */
  before: string;
  hit: string;
  after: string;
}

export interface DocSearchResult {
  sections: DocSection[];
  matches: DocMatch[];
  /** Matches found (equals matches.length unless the scan hit the cap). */
  total: number;
  /** True when scanning stopped at the cap — the UI notes there are more. */
  capped: boolean;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const CONTEXT_BEFORE = 34;
const CONTEXT_AFTER = 52;
/** Hard ceiling so a one-letter query on a huge note can't allocate forever. */
const MAX_MATCHES = 2000;

const EMPTY: DocSearchResult = { sections: [], matches: [], total: 0, capped: false };

/** Estimated 1-based page for a character offset, spread linearly across the
    document's estimated page span (labelled "estimated" wherever shown). */
function pageAt(offset: number, length: number, estPages: number): number {
  if (length <= 0 || estPages <= 1) return 1;
  return Math.min(estPages, Math.floor((offset / length) * estPages) + 1);
}

interface SectionMark extends DocSection {
  offset: number;
}

/** Line starts + heading sections in one pass over the body. */
function scanStructure(body: string, estPages: number): { lineStarts: number[]; sections: SectionMark[] } {
  const lineStarts: number[] = [0];
  const sections: SectionMark[] = [{ title: "", level: 0, line: 1, page: 1, offset: 0 }];
  const len = body.length;
  let lineNo = 1;
  let lineStart = 0;
  for (let i = 0; i <= len; i++) {
    if (i === len || body.charCodeAt(i) === 10) {
      const lineText = body.slice(lineStart, i);
      const m = HEADING_RE.exec(lineText);
      if (m) {
        sections.push({
          title: m[2],
          level: m[1].length,
          line: lineNo,
          page: pageAt(lineStart, len, estPages),
          offset: lineStart,
        });
      }
      if (i < len) {
        lineStarts.push(i + 1);
        lineStart = i + 1;
        lineNo++;
      }
    }
  }
  return { lineStarts, sections };
}

/** 1-based line for an offset, via binary search over line starts. */
function lineOf(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function snippet(body: string, from: number, to: number): { before: string; hit: string; after: string } {
  const s = Math.max(0, from - CONTEXT_BEFORE);
  const e = Math.min(body.length, to + CONTEXT_AFTER);
  const before = (s > 0 ? "…" : "") + body.slice(s, from).replace(/\s+/g, " ");
  const hit = body.slice(from, to).replace(/\s+/g, " ");
  const after = body.slice(to, e).replace(/\s+/g, " ") + (e < body.length ? "…" : "");
  return { before: before.replace(/^…?\s+/, (m) => m.trimEnd()), hit, after };
}

export interface SearchOptions {
  caseSensitive?: boolean;
  /** Whole-word matching (word boundaries around the query). */
  wholeWord?: boolean;
  /** Estimated total pages, for the per-match page tag. */
  estPages: number;
}

/** Finds every occurrence of `query` in `body`, grouped by heading section
    and tagged with an estimated page. Returns EMPTY for a blank query. */
export function searchInDocument(body: string, query: string, opts: SearchOptions): DocSearchResult {
  if (!query) return EMPTY;
  const estPages = Math.max(1, opts.estPages || 1);
  const { lineStarts, sections } = scanStructure(body, estPages);

  const haystack = opts.caseSensitive ? body : body.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const nlen = needle.length;
  if (nlen === 0) return { sections, matches: [], total: 0, capped: false };

  const isWord = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
  const len = body.length;
  const matches: DocMatch[] = [];
  let sectionIdx = 0;
  let total = 0;
  let capped = false;

  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    const end = pos + nlen;
    if (opts.wholeWord) {
      const beforeOk = pos === 0 || !isWord(body[pos - 1]);
      const afterOk = end === len || !isWord(body[end]);
      if (!beforeOk || !afterOk) {
        pos = haystack.indexOf(needle, pos + 1);
        continue;
      }
    }
    total++;
    if (matches.length >= MAX_MATCHES) {
      capped = true;
      break;
    }
    // Advance the section pointer to the last heading at/above this match.
    while (sectionIdx + 1 < sections.length && sections[sectionIdx + 1].offset <= pos) sectionIdx++;
    const snip = snippet(body, pos, end);
    matches.push({
      from: pos,
      to: end,
      line: lineOf(lineStarts, pos),
      page: pageAt(pos, len, estPages),
      section: sectionIdx,
      ...snip,
    });
    pos = haystack.indexOf(needle, end);
  }

  return { sections, matches, total, capped };
}
