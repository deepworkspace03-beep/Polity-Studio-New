/* ── Domain model ─────────────────────────────────────────────────── */

export type TemplateId = "notes" | "revision" | "mcq" | "pyq" | "flashcards";

export type CoverStyle = "regal" | "aurora" | "heritage" | "eclipse" | "custom";

export type CoverPattern = "none" | "grid" | "lines" | "rings" | "weave";

/** The "custom" cover style: a complete design authored in the Cover
    Designer (Details → Cover style → Custom). Every field always has a
    concrete value so the designer UI never juggles fallbacks; the four
    preset styles keep using CSS palettes in covers.css instead. */
export interface CoverDesign {
  /** Background gradient stops — set both to the same color for a solid. */
  bg1: string;
  bg2: string;
  /** Gradient direction in degrees. */
  angle: number;
  /** Title + body text color. */
  ink: string;
  /** Eyebrow, bullets, edition badge and rules. */
  accent: string;
  pattern: CoverPattern;
  /** Pattern line opacity, 0–0.3. */
  patternOpacity: number;
  titleFont: "serif" | "sans";
  /** Multiplies the 44 pt base title size (0.8 – 1.3). */
  titleScale: number;
  align: "left" | "center";
  /** Hairline frame inset from the page edge. */
  frame: boolean;
  /** Temple emblem watermark in the lower-right. */
  emblem: boolean;
  /** Small data-URI image replacing the temple mark in the publisher
      lockup (uploaded in the designer, downscaled before storing). */
  logo?: string;
}
export type PageSize = "a4" | "a5" | "letter";
export type Density = "compact" | "comfort" | "relaxed";
export type AnswersMode = "inline" | "end" | "none";

/** Per-document layout & PDF options — everything the user can tune
    about the exported document without touching code. */
/** Optional per-document overrides on top of the chosen cover style's own
    palette — unset fields keep the style's default look untouched. */
export interface CoverColors {
  bg?: string;
  ink?: string;
  accent?: string;
}

export interface DocLayout {
  cover: boolean;
  coverStyle: CoverStyle;
  /** Custom cover palette overrides — absent/empty means "use the style default". */
  coverColors?: CoverColors;
  /** Full design for coverStyle "custom" — ignored by the preset styles. */
  coverDesign?: CoverDesign;
  toc: boolean;
  watermark: boolean;
  pageSize: PageSize;
  density: Density;
  /** MCQ booklets only: where answers & explanations appear. */
  answers: AnswersMode;
}

export interface Doc {
  id: string;
  title: string;
  subtitle: string;
  template: TemplateId;
  body: string;
  exam: string;
  paper: string;
  session: string;
  author: string;
  lang: "en" | "hi";
  /** Per-document publisher/institute name shown on the cover. Absent =
      use the global brand name (Settings → Branding). */
  institute?: string;
  /** Cover highlight lines ("Premium Study Notes", "120 Questions"…).
      Absent = use the template's default selling points; an empty array
      hides them. Editable per document so every cover word is authorable. */
  coverLines?: string[];
  layout: DocLayout;
  createdAt: number;
  updatedAt: number;
}

/* ── Branding ─────────────────────────────────────────────────────── */

export interface BrandLink {
  url: string;
  label: string;
}

/** One config drives every cover, header, footer, watermark and the
    PDF metadata. Editable in Settings → Branding. */
export interface BrandConfig {
  name: string;
  initiative: string;
  tagline: string;
  website: string;
  telegram: BrandLink;
  whatsapp: BrandLink;
  /** PDF palette (print styles read these as --c-* variables). */
  colors: {
    primary: string;
    primarySoft: string;
    accent: string;
    accentSoft: string;
    gold: string;
  };
  exams: string[];
  author: string;
  watermarkText: string;
}

/* ── App settings ─────────────────────────────────────────────────── */

export type UiTheme = "dark" | "light" | "system";
export type DocTheme = "light" | "dark";

export interface Settings {
  theme: UiTheme;
  /** Reading theme for previews and exports — "dark" renders the
      document itself (pages, PDF, HTML) on a dark, eye-friendly palette. */
  docTheme: DocTheme;
  /** Filename pattern for exports; {title}, {brand} and {date} are replaced. */
  fileNamePattern: string;
  /** Layout applied to newly created documents. */
  newDocLayout: DocLayout;
}
