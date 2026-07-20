import { useSyncExternalStore } from "react";
import type { BrandConfig } from "./types";
import { uid } from "./utils";

/**
 * Interior PDF colour palettes — the ink/accent/highlight scheme applied to
 * every document's body (headings, callouts, tables, links…). A palette is
 * just the five brand colours (`BrandConfig.colors`); applying one writes
 * them via `saveBrand`, exactly like the manual colour pickers, so the whole
 * existing PDF pipeline picks them up with no plumbing.
 *
 * Three premium defaults ship built-in; the author can also customise the
 * colours and save named palettes of their own. Like layout presets and
 * saved cover designs these customs are UI convenience, not document data —
 * they live in localStorage and never travel in a backup.
 *
 * Note: this is a *global* studio setting (it maps onto BrandConfig, which is
 * studio-wide), matching the previous "PDF colors — all documents" control it
 * replaces. Light/dark is handled separately by the global reading-theme
 * toggle, which re-derives this palette for a dark ground (see themeVars in
 * pdf/document.ts) — palettes never carry their own light/dark variants.
 */

export type PaletteColors = BrandConfig["colors"];

export interface ColorPalette {
  id: string;
  name: string;
  colors: PaletteColors;
}

/** The three curated defaults. The first mirrors the studio's factory
    branding so an untouched install shows it as the active palette. */
export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: "oxford",
    name: "Oxford Navy",
    colors: { primary: "#1C3557", primarySoft: "#2C4A74", accent: "#149C94", accentSoft: "#E4F4F2", gold: "#B99659" },
  },
  {
    id: "emerald",
    name: "Forest Emerald",
    colors: { primary: "#123D2C", primarySoft: "#1E5C41", accent: "#2E8B6B", accentSoft: "#E5F3EC", gold: "#C2A15A" },
  },
  {
    id: "burgundy",
    name: "Claret & Copper",
    colors: { primary: "#3E1622", primarySoft: "#6A2233", accent: "#B15641", accentSoft: "#F6E9E3", gold: "#C08A4B" },
  },
];

const KEY = "ps2:colorPalettes";
/** Soft cap — a personal library without unbounded growth. */
export const MAX_PALETTES = 12;

const listeners = new Set<() => void>();
let cache: ColorPalette[] | null = null;

function read(): ColorPalette[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ColorPalette[];
      if (Array.isArray(parsed)) return (cache = parsed);
    }
  } catch {
    /* private mode or corrupt value */
  }
  cache = [];
  return cache;
}

function write(next: ColorPalette[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — stays in-memory for the session */
  }
  for (const cb of listeners) cb();
}

export function useCustomPalettes(): ColorPalette[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => [],
  );
}

export function canSavePalette(): boolean {
  return read().length < MAX_PALETTES;
}

export function saveCustomPalette(name: string, colors: PaletteColors): ColorPalette | null {
  const list = read();
  if (list.length >= MAX_PALETTES) return null;
  const palette: ColorPalette = { id: uid(), name: name.trim() || "My palette", colors: { ...colors } };
  write([...list, palette]);
  return palette;
}

export function deleteCustomPalette(id: string): void {
  write(read().filter((p) => p.id !== id));
}

/** True when `colors` matches this palette exactly — used to highlight the
    active chip. */
export function samePalette(colors: PaletteColors, palette: ColorPalette): boolean {
  const k: (keyof PaletteColors)[] = ["primary", "primarySoft", "accent", "accentSoft", "gold"];
  return k.every((key) => (colors[key] || "").toLowerCase() === (palette.colors[key] || "").toLowerCase());
}
