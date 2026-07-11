import { useSyncExternalStore } from "react";
import { db } from "./db";
import { uid } from "./utils";
import { DEFAULT_BRAND, DEFAULT_SETTINGS } from "../brand/defaults";
import type { BrandConfig, Doc, Settings } from "./types";

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

/** Merges a stored object over the defaults, keeping only keys the
    current schema knows about — old fields (removed features) are
    dropped and newly added defaults survive. */
function withDefaults<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(stored)) {
    if (!(k in (defaults as Record<string, unknown>))) continue;
    const base = (defaults as Record<string, unknown>)[k];
    out[k] =
      base && typeof base === "object" && !Array.isArray(base) && v && typeof v === "object" && !Array.isArray(v)
        ? withDefaults(base as object, v)
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

function normalizeDoc(doc: Doc): Doc {
  const mapped = LEGACY_COVERS[doc.layout.coverStyle as string];
  return mapped ? { ...doc, layout: { ...doc.layout, coverStyle: mapped } } : doc;
}

function normalizeSettings(settings: Settings): Settings {
  const mapped = LEGACY_COVERS[settings.newDocLayout.coverStyle as string];
  return mapped ? { ...settings, newDocLayout: { ...settings.newDocLayout, coverStyle: mapped } } : settings;
}

export async function initStore(): Promise<void> {
  try {
    const [docs, settings, brand] = await Promise.all([
      db.allDocs(),
      db.getKv<Settings>("settings"),
      db.getKv<BrandConfig>("brand"),
    ]);
    setState({
      ready: true,
      docs: docs.map((d) => normalizeDoc(withDefaults(blankDoc(), d))).sort((a, b) => b.updatedAt - a.updatedAt),
      settings: normalizeSettings(withDefaults(DEFAULT_SETTINGS, settings)),
      brand: withDefaults(DEFAULT_BRAND, brand),
    });
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
    lang: "en",
    // Present-but-undefined so the schema merge in withDefaults() preserves
    // an author's per-document cover overrides across reloads (a key it
    // doesn't know about gets silently dropped).
    institute: undefined,
    coverLines: undefined,
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

/** Explicit save — settings/brand already persist on every change; this
    re-writes both records so "Save" gives a definite, observable commit. */
export async function persistSettingsNow(): Promise<void> {
  await Promise.all([db.putKv("settings", state.settings), db.putKv("brand", state.brand)]);
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
    version: 3,
    exportedAt: new Date().toISOString(),
    docs: state.docs,
    settings: state.settings,
    brand: state.brand,
  };
  return JSON.stringify(backup, null, 2);
}

/** Restores a backup (v2 or v3 — unknown fields from older versions are
    dropped by the schema merge). Documents merge by id. */
export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.app !== "polity-studio" || !Array.isArray(data.docs)) {
    throw new Error("Not a Polity Studio backup file.");
  }
  const byId = new Map(state.docs.map((d) => [d.id, d]));
  for (const doc of data.docs) {
    if (!doc.id || typeof doc.body !== "string") continue;
    byId.set(doc.id, normalizeDoc(withDefaults(byId.get(doc.id) ?? { ...blankDoc(), id: doc.id }, doc)));
  }
  const docs = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const settings = normalizeSettings(withDefaults(state.settings, data.settings));
  const brand = withDefaults(state.brand, data.brand);
  setState({ ...state, docs, settings, brand });
  await Promise.all([...docs.map((d) => db.putDoc(d)), db.putKv("settings", settings), db.putKv("brand", brand)]);
  return data.docs.length;
}
