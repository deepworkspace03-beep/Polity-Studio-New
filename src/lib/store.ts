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

export function getState(): AppState {
  return state;
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

/** Deep-ish merge that keeps newly added default fields when older
    persisted objects are loaded (forward-compatible settings). */
function withDefaults<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(stored)) {
    const base = (defaults as Record<string, unknown>)[k];
    out[k] =
      base && typeof base === "object" && !Array.isArray(base) && v && typeof v === "object" && !Array.isArray(v)
        ? withDefaults(base as object, v)
        : (v ?? base);
  }
  return out as T;
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
      docs: docs.sort((a, b) => b.updatedAt - a.updatedAt),
      settings: withDefaults(DEFAULT_SETTINGS, settings),
      brand: withDefaults(DEFAULT_BRAND, brand),
    });
  } catch (err) {
    console.error("[store] failed to load — starting fresh", err);
    setState({ ...state, ready: true });
  }
}

/* ── Document actions ─────────────────────────────────────────────── */

export function createDoc(partial: Pick<Doc, "template" | "title" | "body">): Doc {
  const now = Date.now();
  const doc: Doc = {
    id: uid(),
    subtitle: "",
    exam: state.brand.exams[0] ?? "",
    paper: "",
    session: String(new Date().getFullYear()),
    author: state.brand.author,
    lang: "en",
    layout: { ...state.settings.newDocLayout },
    createdAt: now,
    updatedAt: now,
    ...partial,
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

/* ── Backup / restore ─────────────────────────────────────────────── */

interface Backup {
  app: "polity-studio";
  version: 2;
  exportedAt: string;
  docs: Doc[];
  settings: Omit<Settings, "ai"> & { ai: Omit<Settings["ai"], "apiKey"> };
  brand: BrandConfig;
}

export function exportBackup(): string {
  const { ai, ...rest } = state.settings;
  const { apiKey: _key, ...aiRest } = ai;
  const backup: Backup = {
    app: "polity-studio",
    version: 2,
    exportedAt: new Date().toISOString(),
    docs: state.docs,
    settings: { ...rest, ai: aiRest },
    brand: state.brand,
  };
  return JSON.stringify(backup, null, 2);
}

export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.app !== "polity-studio" || !Array.isArray(data.docs)) {
    throw new Error("Not a Polity Studio backup file.");
  }
  const byId = new Map(state.docs.map((d) => [d.id, d]));
  for (const doc of data.docs) {
    if (!doc.id || typeof doc.body !== "string") continue;
    byId.set(doc.id, withDefaults(byId.get(doc.id) ?? { ...createDefaultsFor(doc) }, doc));
  }
  const docs = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const settings = withDefaults(state.settings, data.settings);
  const brand = withDefaults(state.brand, data.brand);
  setState({ ...state, docs, settings, brand });
  await Promise.all([...docs.map((d) => db.putDoc(d)), db.putKv("settings", settings), db.putKv("brand", brand)]);
  return data.docs.length;
}

function createDefaultsFor(doc: Partial<Doc>): Doc {
  const now = Date.now();
  return {
    id: doc.id ?? uid(),
    title: "Untitled",
    subtitle: "",
    template: "notes",
    body: "",
    exam: "",
    paper: "",
    session: "",
    author: state.brand.author,
    lang: "en",
    layout: { ...state.settings.newDocLayout },
    createdAt: now,
    updatedAt: now,
  };
}
