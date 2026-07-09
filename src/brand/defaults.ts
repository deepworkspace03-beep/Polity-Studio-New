import type { BrandConfig, DocLayout, Settings } from "../lib/types";

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
  toc: true,
  watermark: true,
  pageSize: "a4",
  density: "comfort",
  answers: "end",
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fileNamePattern: "{title} — {brand}",
  newDocLayout: DEFAULT_LAYOUT,
};
