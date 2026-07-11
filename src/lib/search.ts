import type { Doc } from "./types";

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
    for (const tok of tokens) {
      if (f.title.includes(tok)) {
        score += f.title.startsWith(tok) ? 40 : 25;
      } else if (f.meta.includes(tok)) {
        score += 12;
      } else {
        const i = f.body.indexOf(tok);
        if (i < 0) {
          ok = false;
          break;
        }
        score += 6;
        if (bodyIdx < 0 || i < bodyIdx) bodyIdx = i;
      }
    }
    if (!ok) continue;
    const hit: SearchHit = { doc, score };
    if (bodyIdx >= 0) {
      hit.line = lineAt(doc.body, bodyIdx);
      hit.snippet = snippetAt(doc.body, bodyIdx);
    }
    hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt).slice(0, limit);
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
