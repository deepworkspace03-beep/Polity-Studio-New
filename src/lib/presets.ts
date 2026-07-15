import { useSyncExternalStore } from "react";
import type { DocLayout } from "./types";
import { DEFAULT_LAYOUT } from "../brand/defaults";
import { uid } from "./utils";

/**
 * Named layout presets — reusable "looks" (cover style, TOC, watermark,
 * page size, density, answer placement) an author can save once and apply
 * to any document. Kept small and browser-local on purpose: they are UI
 * convenience, not document data, so they live in localStorage rather than
 * IndexedDB and never travel in a document backup. A handful of starters
 * seed on first run so the feature is discoverable; every one of them is
 * editable and deletable like any user preset.
 *
 * Extension point: presets store a whole DocLayout, so adding a layout
 * field automatically flows through save/apply with no change here.
 */

export interface LayoutPreset {
  id: string;
  name: string;
  layout: DocLayout;
}

const KEY = "ps2:layoutPresets";
/** Soft cap — the spec targets ~4–5; a little headroom avoids nagging. */
export const MAX_PRESETS = 8;

// Four starters matching the studio's preset slots — "Default" is the
// factory layout; Preset 1–3 are distinct ready-made looks. All are
// renamable, editable and deletable like any user preset.
const STARTERS: Omit<LayoutPreset, "id">[] = [
  { name: "Default", layout: { ...DEFAULT_LAYOUT } },
  { name: "Preset 1 · Premium Notes", layout: { ...DEFAULT_LAYOUT, coverStyle: "regal", toc: true, watermark: true, density: "comfort" } },
  { name: "Preset 2 · Minimal", layout: { ...DEFAULT_LAYOUT, coverStyle: "heritage", toc: false, watermark: false, density: "comfort" } },
  { name: "Preset 3 · Compact Booklet", layout: { ...DEFAULT_LAYOUT, coverStyle: "eclipse", toc: true, watermark: true, pageSize: "a5", density: "compact" } },
];

const listeners = new Set<() => void>();
let cache: LayoutPreset[] | null = null;

function read(): LayoutPreset[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutPreset[];
      if (Array.isArray(parsed)) return (cache = parsed);
    }
  } catch {
    /* private mode or corrupt value — fall through to seed */
  }
  cache = STARTERS.map((p) => ({ ...p, id: uid() }));
  write(cache);
  return cache;
}

function write(next: LayoutPreset[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — presets stay in-memory for the session */
  }
  for (const cb of listeners) cb();
}

export function usePresets(): LayoutPreset[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => [],
  );
}

/** True when another preset can be saved without exceeding the soft cap. */
export function canSavePreset(): boolean {
  return read().length < MAX_PRESETS;
}

export function savePreset(name: string, layout: DocLayout): LayoutPreset | null {
  const list = read();
  if (list.length >= MAX_PRESETS) return null;
  const preset: LayoutPreset = { id: uid(), name: name.trim() || "Preset", layout: { ...layout } };
  write([...list, preset]);
  return preset;
}

export function renamePreset(id: string, name: string): void {
  write(read().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
}

export function duplicatePreset(id: string): void {
  const list = read();
  if (list.length >= MAX_PRESETS) return;
  const src = list.find((p) => p.id === id);
  if (!src) return;
  write([...list, { id: uid(), name: `${src.name} (copy)`, layout: { ...src.layout } }]);
}

export function deletePreset(id: string): void {
  write(read().filter((p) => p.id !== id));
}
