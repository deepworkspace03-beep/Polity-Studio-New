import { useSyncExternalStore } from "react";
import type { CoverDesign } from "./types";
import { uid } from "./utils";

/**
 * Saved cover designs — a browser-local library of custom covers the author
 * has designed in the Cover Designer and named for reuse. They sit directly
 * alongside the built-in preset styles in the cover picker, so applying a
 * saved look is one tap, exactly like choosing a default.
 *
 * Like layout presets (lib/presets.ts) these are UI convenience, not document
 * data: they live in localStorage, never travel in a document backup, and a
 * saved design is a full CoverDesign snapshot (applied by switching the
 * document to the "custom" cover style with this design).
 */

export interface SavedCoverDesign {
  id: string;
  name: string;
  design: CoverDesign;
  /** Starred designs surface in the compact cover picker (top 3 shown
      beside the built-in presets). Absent = not favorited. */
  favorite?: boolean;
}

const KEY = "ps2:coverDesigns";
/** Soft cap — plenty for a personal library without unbounded growth. */
export const MAX_COVER_DESIGNS = 12;

const listeners = new Set<() => void>();
let cache: SavedCoverDesign[] | null = null;

function read(): SavedCoverDesign[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedCoverDesign[];
      if (Array.isArray(parsed)) return (cache = parsed);
    }
  } catch {
    /* private mode or corrupt value */
  }
  cache = [];
  return cache;
}

function write(next: SavedCoverDesign[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — stays in-memory for the session */
  }
  for (const cb of listeners) cb();
}

export function useCoverDesigns(): SavedCoverDesign[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => [],
  );
}

export function canSaveCoverDesign(): boolean {
  return read().length < MAX_COVER_DESIGNS;
}

export function saveCoverDesign(name: string, design: CoverDesign): SavedCoverDesign | null {
  const list = read();
  if (list.length >= MAX_COVER_DESIGNS) return null;
  const saved: SavedCoverDesign = { id: uid(), name: name.trim() || "My design", design: { ...design } };
  write([...list, saved]);
  return saved;
}

export function renameCoverDesign(id: string, name: string): void {
  write(read().map((d) => (d.id === id ? { ...d, name: name.trim() || d.name } : d)));
}

/** Max favorited designs shown inline beside the presets. */
export const MAX_FAVORITE_COVERS = 3;

/** Star/unstar a saved design. Starring past the display cap is still
    allowed — the picker just shows the most-recently-saved favorites; the
    full library stays available in "Manage designs". */
export function toggleFavoriteCoverDesign(id: string): void {
  write(read().map((d) => (d.id === id ? { ...d, favorite: !d.favorite } : d)));
}

/** The favorited designs shown inline in the compact picker (newest first,
    capped at MAX_FAVORITE_COVERS). */
export function favoriteCoverDesigns(list: SavedCoverDesign[]): SavedCoverDesign[] {
  return list.filter((d) => d.favorite).slice(0, MAX_FAVORITE_COVERS);
}

export function deleteCoverDesign(id: string): void {
  write(read().filter((d) => d.id !== id));
}
