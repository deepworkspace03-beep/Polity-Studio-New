/* ── Domain model ─────────────────────────────────────────────────── */

/** The four document types. Legacy ids ("mcq", "pyq", "flashcards")
    migrate on load — see LEGACY_TEMPLATES in lib/store.ts. */
export type TemplateId = "notes" | "questions" | "revision" | "universal";

/** The default cover styles. Legacy ids ("regal", "heritage", "ivory",
    "midnight") migrate on load — see LEGACY_COVERS in lib/store.ts. */
export type CoverStyle = "meridian" | "aurora" | "eclipse" | "custom";

/** Cover pattern layer — a small, curated set of subtle, publication-grade
    textures. Retired patterns (grid, dots, lines, rings, weave, waves, mesh)
    migrate to the nearest survivor on load (resolveDesign). */
export type CoverPattern = "none" | "geometry" | "abstract" | "globe";

/** Hairline frame inset from the page edge (Cover Designer → Structure).
    Legacy "double" designs migrate to "shaded" on load (resolveDesign). */
export type CoverHairline = "none" | "single" | "shaded" | "accent";

/** Optional box treatment behind the title block (Cover Designer). */
export type CoverTitleBox = "none" | "outline" | "filled" | "premium";

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
  /** Pattern element spacing (density), 0.5–2 — higher packs more
      lines/dots in. Optional so older stored designs default to 1. */
  patternDensity?: number;
  /** Pattern stroke/dot size, 0.5–2.5 — optional, defaults to 1. */
  patternSize?: number;
  titleFont: "serif" | "sans";
  /** Multiplies the 44 pt base title size (0.8 – 1.3). */
  titleScale: number;
  align: "left" | "center";
  /** Hairline frame inset from the page edge. Kept for backward
      compatibility — `frameStyle` supersedes it (legacy true = "single"). */
  frame: boolean;
  /** Frame variant: none · single · double · accent-colored. Optional so
      older stored designs derive it from the legacy `frame` boolean. */
  frameStyle?: CoverHairline;
  /** Box treatment behind the title block — outline, filled or the
      premium ruled band. Optional, defaults to "none". */
  titleBox?: CoverTitleBox;
  /** Temple emblem watermark in the lower-right. */
  emblem: boolean;
  /** Small data-URI image replacing the temple mark in the publisher
      lockup (uploaded in the designer, downscaled before storing). */
  logo?: string;
}
export type PageSize = "a4" | "a5" | "letter";
export type Density = "ultra" | "compact" | "comfort" | "relaxed";
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
  /** Question Bank only: where answers & solutions appear — "inline"
      highlights the correct option and shows the solution under each
      question; "end" collects a key + explanations at the back;
      "none" prints a clean question paper. */
  answers: AnswersMode;
  /** Question Bank only: every "##" unit/section opens on a fresh page —
      the examination-book convention. Absent = true; optional so stored
      documents predating the option keep their saved layout untouched. */
  qbUnitBreaks?: boolean;
  /** Question Bank only: show each question's topic pill in its header
      row. Absent = true. When off the header row is dropped entirely —
      the number folds into the question line and the source moves to a
      compact inline chip at the end of the stem, saving a full row per
      question. */
  qbTopics?: boolean;
  /** Question Bank only: interior question columns — 1 (default) or the
      compact two-column examination layout. Absent = 1. */
  qbColumns?: 1 | 2;
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
  /** Cover edition badge (top-right), e.g. "1e", "2e". Separate from
      the session so both can be managed independently. */
  edition: string;
  author: string;
  /** Cover language badge only — never affects document content. "both"
      shows English + हिन्दी, "none" shows no badge. */
  lang: "en" | "hi" | "both" | "none";
  /** Per-document publisher/institute name shown on the cover. Absent =
      use the global brand name (Settings → Branding). */
  institute?: string;
  /** Cover highlight lines ("Premium Study Notes", "120 Questions"…).
      Absent = use the template's default selling points; an empty array
      hides them. Editable per document so every cover word is authorable. */
  coverLines?: string[];
  /** Starred in the Library — pinned to the quick-access row. Toggling
      it never bumps updatedAt (curation is not editing). */
  favorite?: boolean;
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
/** Library ordering. Each field carries an explicit direction so the
    control is unambiguous. Legacy stored values "modified"/"created"
    migrate to "modified-desc"/"created-asc" in lib/store.ts. */
export type LibrarySort =
  | "modified-desc" // Latest modified first (default)
  | "modified-asc" // Oldest modified first
  | "created-desc" // Latest created first
  | "created-asc" // Oldest created first (reading a course front to back)
  | "name-asc" // A → Z
  | "name-desc" // Z → A
  | "size-desc" // Largest first
  | "size-asc"; // Smallest first

export interface Settings {
  theme: UiTheme;
  /** Reading theme for previews and exports — "dark" renders the
      document itself (pages, PDF, HTML) on a dark, eye-friendly palette. */
  docTheme: DocTheme;
  /** Filename pattern for exports; {title}, {brand} and {date} are replaced. */
  fileNamePattern: string;
  /** Library document ordering. */
  librarySort: LibrarySort;
  /** Layout applied to newly created documents. */
  newDocLayout: DocLayout;
}
