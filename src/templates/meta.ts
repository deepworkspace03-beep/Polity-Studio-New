import type { DocLayout, TemplateId } from "../lib/types";
import { STARTERS } from "./starters";

/**
 * Template metadata — everything the UI needs to list, create and
 * configure documents. Kept separate from the body builders so the
 * library view doesn't pull the markdown engine into the initial load.
 *
 * The document model is deliberately small (v3.1): Notes for prose,
 * Question Bank for MCQs and PYQs alike (solved vs. practice is the
 * per-document "answers" layout choice, not a separate type), Revision
 * for compact sheets and flash-card decks (the "deck" layout toggle),
 * and Universal for brand-neutral general-purpose documents.
 */

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  /** Feather-style icon path data, 24×24 stroke. */
  icon: string;
  starterTitle: string;
  starter: string;
  /** Whether the TOC option applies to this template. */
  hasToc: boolean;
  /** Whether the answers-placement option applies (Question Bank). */
  hasAnswers: boolean;
  /** Whether the flash-card deck layout toggle applies (Revision). */
  hasDeck?: boolean;
  /** Brand-neutral chrome: no institute lockup fallback, no branded
      footer, no watermark by default (Universal). */
  plainChrome?: boolean;
  /** Layout fields a fresh document of this type overrides on top of
      the studio-wide new-document defaults. */
  layoutDefaults?: Partial<DocLayout>;
}

export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  notes: {
    id: "notes",
    name: "Notes",
    description: "Long-form study material — chapters, articles and explanations with cover, contents and callouts.",
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    starterTitle: STARTERS.notes.title,
    starter: STARTERS.notes.body,
    hasToc: true,
    hasAnswers: false,
  },
  qbank: {
    id: "qbank",
    name: "Question Bank",
    description: "MCQs and previous-year questions — solved inline or with a back-of-book answer key.",
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    starterTitle: STARTERS.qbank.title,
    starter: STARTERS.qbank.body,
    hasToc: false,
    hasAnswers: true,
  },
  revision: {
    id: "revision",
    name: "Revision",
    description: "Compact bullet sheets for last-minute review — or a cut-out flash-card deck.",
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    starterTitle: STARTERS.revision.title,
    starter: STARTERS.revision.body,
    hasToc: true,
    hasAnswers: false,
    hasDeck: true,
  },
  universal: {
    id: "universal",
    name: "Universal",
    description: "A clean, brand-neutral document for any purpose — reports, manuals, articles, personal writing.",
    icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    starterTitle: STARTERS.universal.title,
    starter: STARTERS.universal.body,
    hasToc: true,
    hasAnswers: false,
    plainChrome: true,
    layoutDefaults: { watermark: false, coverStyle: "heritage" },
  },
};

export const TEMPLATE_META_LIST: TemplateMeta[] = Object.values(TEMPLATE_META);
