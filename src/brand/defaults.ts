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
  // "inline" is the Question Bank's professional exam-book default: the
  // correct option is highlighted with a ✓ and the solution sits under
  // each question. "end" (back-of-book key) remains for practice tests.
  answers: "inline",
};

/* ── Cover Designer seeds ─────────────────────────────────────────────
   Switching to the "Custom" cover starts from the palette of the preset
   the author was using, so the designer never opens on a blank slate. */

export const DEFAULT_COVER_DESIGN: CoverDesign = {
  bg1: "#0a1324",
  bg2: "#1a2e54",
  angle: 163,
  ink: "#f6f3ec",
  accent: "#cdbd96",
  pattern: "dots",
  patternOpacity: 0.05,
  patternDensity: 1,
  patternSize: 1,
  titleFont: "serif",
  titleScale: 1,
  align: "left",
  // frameStyle/titleBox stay unset here on purpose: a design without
  // frameStyle derives it from the legacy `frame` boolean, and a "none"
  // default merged over an old design would mask that derivation.
  frame: false,
  headerRule: false,
  emblem: true,
};

export function seedCoverDesign(from: CoverStyle): CoverDesign {
  const seeds: Partial<Record<CoverStyle, Partial<CoverDesign>>> = {
    aurora: { bg1: "#123c93", bg2: "#0a9f80", angle: 158, ink: "#ffffff", accent: "#eafff6", pattern: "rings", patternOpacity: 0.09, titleFont: "sans" },
    heritage: { bg1: "#fcfaf4", bg2: "#f4f0e6", angle: 168, ink: "#1a2740", accent: "#90713d", pattern: "lines", patternOpacity: 0.06, frame: true, frameStyle: "shaded" },
    eclipse: { bg1: "#0c1017", bg2: "#1a2434", angle: 172, ink: "#f0f3f9", accent: "#d3a662", pattern: "rings", patternOpacity: 0.08, frame: true, frameStyle: "accent" },
  };
  return { ...DEFAULT_COVER_DESIGN, ...seeds[from] };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  docTheme: "light",
  fileNamePattern: "{title} — {brand}",
  librarySort: "modified-desc",
  newDocLayout: DEFAULT_LAYOUT,
};
