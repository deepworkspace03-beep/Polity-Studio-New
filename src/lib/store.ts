import { useSyncExternalStore } from "react";
import { db } from "./db";
import { uid } from "./utils";
import { DEFAULT_BRAND, DEFAULT_SETTINGS } from "../brand/defaults";
import type { BrandConfig, Doc, DocLayout, Settings } from "./types";

/**
 * One reactive app store backed by IndexedDB. Documents are edited in
 * memory instantly and persisted with a short debounce per document;
 * everything flushes on pagehide so a closed tab never loses work.
 */

export interface AppState {
  ready: boolean;
  docs: Doc[];
  settings: Settings;
  brand: BrandConfig;
}

let state: AppState = {
  ready: false,
  docs: [],
  settings: DEFAULT_SETTINGS,
  brand: DEFAULT_BRAND,
};

const listeners = new Set<() => void>();

function setState(next: AppState): void {
  state = next;
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

/* ── Persistence ──────────────────────────────────────────────────── */

const SAVE_DELAY = 600;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(doc: Doc): void {
  const existing = pendingSaves.get(doc.id);
  if (existing) clearTimeout(existing);
  pendingSaves.set(
    doc.id,
    setTimeout(() => {
      pendingSaves.delete(doc.id);
      void db.putDoc(doc);
    }, SAVE_DELAY),
  );
}

export function flushSaves(): void {
  for (const [id, timer] of pendingSaves) {
    clearTimeout(timer);
    const doc = state.docs.find((d) => d.id === id);
    if (doc) void db.putDoc(doc);
  }
  pendingSaves.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSaves);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSaves();
  });
}

/** Optional `Doc` fields (`institute?`, `coverLines?`, `edition?`) — the
    single place to register a new one. Typed `satisfies readonly (keyof
    Doc)[]` so a typo or a renamed/removed field fails `tsc`, not a
    user's reload. */
export const DOC_OPTIONAL_KEYS = ["institute", "coverLines", "edition"] as const satisfies readonly (keyof Doc)[];
/** Optional `DocLayout` fields (`coverColors?`, `coverDesign?`, `deck?`)
    — same contract as DOC_OPTIONAL_KEYS, one level down. */
export const LAYOUT_OPTIONAL_KEYS = ["coverColors", "coverDesign", "deck"] as const satisfies readonly (keyof DocLayout)[];

/** Merges a stored object over the defaults, keeping only keys the
    current schema knows about — old fields (removed features) are
    dropped and newly added defaults survive.
    `preserveKeys` lists fields that are legitimately *optional* on the
    type (so they may be entirely absent from `defaults`, e.g. a fresh
    `Doc` has no `institute`) but must still survive the merge when a
    stored object has them. Without this, a key missing from `defaults`
    reads as "unknown/removed field" and is silently dropped — see
    store.test.ts for the regression this guards against. `layout` /
    `newDocLayout` are recognized by name so the one nested object with
    its own optional fields (DocLayout) gets LAYOUT_OPTIONAL_KEYS
    automatically, without every call site having to know that.
    Exported for the regression test in store.test.ts — not meant to be
    called from outside this module otherwise. */
export function withDefaults<T extends object>(defaults: T, stored: unknown, preserveKeys: readonly (keyof T)[] = []): T {
  if (!stored || typeof stored !== "object") return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  const preserve = new Set<string>(preserveKeys as readonly string[]);
  for (const [k, v] of Object.entries(stored)) {
    if (!(k in (defaults as Record<string, unknown>)) && !preserve.has(k)) continue;
    const base = (defaults as Record<string, unknown>)[k];
    const nested = k === "layout" || k === "newDocLayout" ? (LAYOUT_OPTIONAL_KEYS as readonly string[]) : [];
    out[k] =
      base && typeof base === "object" && !Array.isArray(base) && v && typeof v === "object" && !Array.isArray(v)
        ? withDefaults(base as object, v, nested as readonly (keyof object)[])
        : (v ?? base);
  }
  return out as T;
}

/** Retired cover styles map onto their closest current replacement so
    older documents (and backups) keep a sensible cover. */
const LEGACY_COVERS: Record<string, Doc["layout"]["coverStyle"]> = {
  ivory: "heritage",
  midnight: "eclipse",
};

/** Retired template ids → the unified document model (v3.1). MCQ and PYQ
    merged into the Question Bank; Flash Cards merged into Revision. The
    mapper keeps each old document rendering as before: a PYQ collection
    was always solved-inline, a flash-card deck keeps its card grid. */
const LEGACY_TEMPLATES: Record<string, { template: Doc["template"]; layout?: Partial<Doc["layout"]> }> = {
  mcq: { template: "qbank" },
  pyq: { template: "qbank", layout: { answers: "inline" } },
  flashcards: { template: "revision", layout: { deck: true } },
};

/** Schema version stored in kv (and stamped into backups) — bumped when
    a stored value changes meaning, so migrations run exactly once. v4:
    "en" stopped meaning "no language label" (that moved to "none") and
    became an explicit English cover badge. */
const SCHEMA_VERSION = 4;

function normalizeDoc(doc: Doc, legacyLang = false): Doc {
  const cover = LEGACY_COVERS[doc.layout.coverStyle as string];
  if (cover) doc = { ...doc, layout: { ...doc.layout, coverStyle: cover } };
  const tpl = LEGACY_TEMPLATES[doc.template as string];
  if (tpl) doc = { ...doc, template: tpl.template, layout: { ...doc.layout, ...tpl.layout } };
  // Pre-v4 data: "en" meant "no label", so map it to "none" — the cover
  // keeps looking exactly as it did. Post-v4 "en" is a real choice.
  if (legacyLang && doc.lang === "en") doc = { ...doc, lang: "none" };
  return doc;
}

function normalizeSettings(settings: Settings): Settings {
  const mapped = LEGACY_COVERS[settings.newDocLayout.coverStyle as string];
  return mapped ? { ...settings, newDocLayout: { ...settings.newDocLayout, coverStyle: mapped } } : settings;
}

export async function initStore(): Promise<void> {
  try {
    const [docs, settings, brand, schema] = await Promise.all([
      db.allDocs(),
      db.getKv<Settings>("settings"),
      db.getKv<BrandConfig>("brand"),
      db.getKv<number>("schema"),
    ]);
    const legacyLang = (schema ?? 0) < SCHEMA_VERSION;
    const normalized = docs
      .map((d) => normalizeDoc(withDefaults(blankDoc(), d, DOC_OPTIONAL_KEYS), legacyLang))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setState({
      ready: true,
      docs: normalized,
      settings: normalizeSettings(withDefaults(DEFAULT_SETTINGS, settings)),
      brand: withDefaults(DEFAULT_BRAND, brand),
    });
    if (legacyLang) {
      // One-time upgrade: persist the migrated documents and stamp the
      // schema version so future loads never re-run the mapping.
      void Promise.all([...normalized.map((d) => db.putDoc(d)), db.putKv("schema", SCHEMA_VERSION)]);
    }
  } catch (err) {
    console.error("[store] failed to load — starting fresh", err);
    setState({ ...state, ready: true });
  }
}

/* ── Document actions ─────────────────────────────────────────────── */

function blankDoc(): Doc {
  const now = Date.now();
  return {
    id: uid(),
    title: "Untitled",
    subtitle: "",
    template: "notes",
    body: "",
    exam: "",
    paper: "",
    session: "",
    author: state.brand.author,
    lang: "none",
    layout: { ...state.settings.newDocLayout },
    createdAt: now,
    updatedAt: now,
  };
}

export function createDoc(partial: Pick<Doc, "template" | "title" | "body"> & Partial<Doc>): Doc {
  const doc: Doc = {
    ...blankDoc(),
    exam: state.brand.exams[0] ?? "",
    session: String(new Date().getFullYear()),
    ...partial,
    id: uid(),
  };
  setState({ ...state, docs: [doc, ...state.docs] });
  void db.putDoc(doc);
  return doc;
}

export function updateDoc(id: string, patch: Partial<Omit<Doc, "id">>): void {
  const idx = state.docs.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const doc: Doc = { ...state.docs[idx], ...patch, updatedAt: Date.now() };
  const docs = [...state.docs];
  docs[idx] = doc;
  setState({ ...state, docs });
  schedulePersist(doc);
}

export function deleteDoc(id: string): void {
  setState({ ...state, docs: state.docs.filter((d) => d.id !== id) });
  void db.deleteDoc(id);
}

/** Bulk delete (Library select mode) — one state update, deletes run in
    parallel rather than serially re-rendering per document. */
export function deleteDocs(ids: string[]): void {
  const set = new Set(ids);
  setState({ ...state, docs: state.docs.filter((d) => !set.has(d.id)) });
  void Promise.all(ids.map((id) => db.deleteDoc(id)));
}

/** Combines two or more documents into one new document, each source
    separated by a manual page break so the merged PDF starts each part
    on its own page. Takes the first (most recently updated) selected
    document's template and layout — merging across templates isn't
    meaningful since each has its own body grammar (MCQ vs flashcards…). */
export function mergeDocs(ids: string[]): Doc | null {
  const selected = ids.map((id) => state.docs.find((d) => d.id === id)).filter((d): d is Doc => !!d);
  if (selected.length < 2) return null;
  const base = selected[0];
  const body = selected.map((d) => d.body.trim()).join("\n\n\\pagebreak\n\n");
  const doc = createDoc({
    template: base.template,
    title: `${base.title || "Untitled"} + ${selected.length - 1} more`,
    body,
    subtitle: base.subtitle,
    exam: base.exam,
    paper: base.paper,
    session: base.session,
    author: base.author,
    lang: base.lang,
    layout: { ...base.layout },
  });
  return doc;
}

export async function deleteAllDocs(): Promise<void> {
  const ids = state.docs.map((d) => d.id);
  setState({ ...state, docs: [] });
  await Promise.all(ids.map((id) => db.deleteDoc(id)));
}

export function duplicateDoc(id: string): Doc | null {
  const src = state.docs.find((d) => d.id === id);
  if (!src) return null;
  const now = Date.now();
  const copy: Doc = { ...src, id: uid(), title: `${src.title} (copy)`, createdAt: now, updatedAt: now };
  setState({ ...state, docs: [copy, ...state.docs] });
  void db.putDoc(copy);
  return copy;
}

/* ── Settings & branding ──────────────────────────────────────────── */

export function saveSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ ...state, settings });
  void db.putKv("settings", settings);
}

export function saveBrand(patch: Partial<BrandConfig>): void {
  const brand = { ...state.brand, ...patch };
  setState({ ...state, brand });
  void db.putKv("brand", brand);
}

/** Restores factory settings and branding. Documents are untouched. */
export async function resetSettingsAndBrand(): Promise<void> {
  const settings = { ...DEFAULT_SETTINGS, newDocLayout: { ...DEFAULT_SETTINGS.newDocLayout } };
  const brand = { ...DEFAULT_BRAND, colors: { ...DEFAULT_BRAND.colors }, telegram: { ...DEFAULT_BRAND.telegram }, whatsapp: { ...DEFAULT_BRAND.whatsapp }, exams: [...DEFAULT_BRAND.exams] };
  setState({ ...state, settings, brand });
  await Promise.all([db.putKv("settings", settings), db.putKv("brand", brand)]);
}

/* ── Backup / restore ─────────────────────────────────────────────── */

interface Backup {
  app: "polity-studio";
  version: number;
  exportedAt: string;
  docs: Doc[];
  settings: Settings;
  brand: BrandConfig;
}

export function exportBackup(): string {
  const backup: Backup = {
    app: "polity-studio",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    docs: state.docs,
    settings: state.settings,
    brand: state.brand,
  };
  return JSON.stringify(backup, null, 2);
}

/** Restores a backup (v2–v4 — unknown fields from older versions are
    dropped by the schema merge). Documents merge by id. */
export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.app !== "polity-studio" || !Array.isArray(data.docs)) {
    throw new Error("Not a Polity Studio backup file.");
  }
  const legacyLang = (data.version ?? 0) < SCHEMA_VERSION;
  const byId = new Map(state.docs.map((d) => [d.id, d]));
  for (const doc of data.docs) {
    if (!doc.id || typeof doc.body !== "string") continue;
    byId.set(doc.id, normalizeDoc(withDefaults(byId.get(doc.id) ?? { ...blankDoc(), id: doc.id }, doc, DOC_OPTIONAL_KEYS), legacyLang));
  }
  const docs = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const settings = normalizeSettings(withDefaults(state.settings, data.settings));
  const brand = withDefaults(state.brand, data.brand);
  setState({ ...state, docs, settings, brand });
  await Promise.all([...docs.map((d) => db.putDoc(d)), db.putKv("settings", settings), db.putKv("brand", brand)]);
  return data.docs.length;
}
