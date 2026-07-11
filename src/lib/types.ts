/* ── Domain model ─────────────────────────────────────────────────── */

export type TemplateId = "notes" | "revision" | "mcq" | "pyq" | "flashcards";

export type CoverStyle = "regal" | "aurora" | "heritage" | "eclipse";
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
