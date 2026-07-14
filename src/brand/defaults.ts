import type { BrandConfig, CoverDesign, CoverStyle, DocLayout, Settings } from "../lib/types";

/** Bundled default branding — Polity Made Simple. Every value is
    editable in-app (Settings → Branding) and stored locally. */
export const DEFAULT_BRAND: BrandConfig = {
  name: "Polity Made Simple",
  initiative: "A JRF Club Initiative",
  tagline: "Study Smarter, Learn Faster",
  website: "https://www.politymadesimple.com",
  telegram: {
    url: "https://t.me/politicalsciencenetjrfclub",
    label: "t.me/politicalsciencenetjrfclub",
  },
  whatsapp: {
    url: "https://whatsapp.com/channel/0029VbCCAKL42DcZ9no2Mo0R",
    label: "WhatsApp Channel",
  },
  colors: {
    primary: "#1C3557",
    primarySoft: "#2C4A74",
    accent: "#149C94",
    accentSoft: "#E4F4F2",
    gold: "#B99659",
  },
  exams: [
    "UGC-NET/JRF Political Science",
    "CUET-PG Political Science",
    "Rajasthan SET Political Science",
    "UPSC Optional — PSIR",
  ],
  author: "Deepak Kumar Swami",
  watermarkText: "© Polity Made Simple",
};

export const DEFAULT_LAYOUT: DocLayout = {
  cover: true,
  coverStyle: "regal",
  // coverColors/coverDesign are optional and correctly omitted here —
  // lib/store.ts's withDefaults() preserves them via LAYOUT_OPTIONAL_KEYS
  // even though they're absent from this default object.
  toc: true,
  watermark: true,
  pageSize: "a4",
  density: "comfort",
  answers: "end",
  revisionStyle: "notes",
  typography: "serif",
};

/* ── Cover Designer seeds ─────────────────────────────────────────────
   Switching to the "Custom" cover starts from the palette of the preset
   the author was using, so the designer never opens on a blank slate. */

export const DEFAULT_COVER_DESIGN: CoverDesign = {
  bg1: "#0d1930",
  bg2: "#1d3357",
  angle: 160,
  ink: "#f5f2ea",
  accent: "#c9bc9e",
  pattern: "grid",
  patternOpacity: 0.035,
  titleFont: "serif",
  titleScale: 1,
  align: "left",
  frame: false,
  emblem: true,
};

export function seedCoverDesign(from: CoverStyle): CoverDesign {
  const seeds: Partial<Record<CoverStyle, Partial<CoverDesign>>> = {
    aurora: { bg1: "#123c93", bg2: "#0a9f80", angle: 158, ink: "#ffffff", accent: "#eafff6", pattern: "rings", patternOpacity: 0.07, titleFont: "sans" },
    heritage: { bg1: "#faf8f2", bg2: "#f2eee2", angle: 168, ink: "#1a2740", accent: "#8a6d3b", pattern: "lines", patternOpacity: 0.055, frame: true },
    eclipse: { bg1: "#0c1017", bg2: "#1a2434", angle: 172, ink: "#f0f3f9", accent: "#d3a662", pattern: "rings", patternOpacity: 0.065, frame: true },
  };
  return { ...DEFAULT_COVER_DESIGN, ...seeds[from] };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  docTheme: "light",
  fileNamePattern: "{title} — {brand}",
  newDocLayout: DEFAULT_LAYOUT,
};
