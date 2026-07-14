import type { TemplateId } from "../lib/types";
import { STARTERS } from "./starters";

/**
 * Template metadata — everything the UI needs to list, create and
 * configure documents. Kept separate from the body builders so the
 * library view doesn't pull the markdown engine into the initial load.
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
  /** Whether the summary/cards layout toggle applies (Revision). */
  hasRevisionStyle: boolean;
  /** Whether the per-page watermark option applies. Universal defaults
      it off and hides the toggle — a branded watermark makes no sense on
      a template designed to carry no fixed branding. */
  hasWatermark: boolean;
}

export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  notes: {
    id: "notes",
    name: "Notes",
    description: "Long-form chapters with cover, contents and callouts.",
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    starterTitle: STARTERS.notes.title,
    starter: STARTERS.notes.body,
    hasToc: true,
    hasAnswers: false,
    hasRevisionStyle: false,
    hasWatermark: true,
  },
  "question-bank": {
    id: "question-bank",
    name: "Question Bank",
    description: "MCQs and previous-year questions — one format, tagged with Source, Session or Exam metadata.",
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    starterTitle: STARTERS["question-bank"].title,
    starter: STARTERS["question-bank"].body,
    hasToc: false,
    hasAnswers: true,
    hasRevisionStyle: false,
    hasWatermark: true,
  },
  revision: {
    id: "revision",
    name: "Revision",
    description: "Rapid review — a dense summary layout or a front/back flashcard deck.",
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    starterTitle: STARTERS.revision.title,
    starter: STARTERS.revision.body,
    hasToc: true,
    hasAnswers: false,
    hasRevisionStyle: true,
    hasWatermark: true,
  },
  universal: {
    id: "universal",
    name: "Universal",
    description: "A brand-neutral document for anything — reports, manuals, personal writing. No fixed branding.",
    icon: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    starterTitle: STARTERS.universal.title,
    starter: STARTERS.universal.body,
    hasToc: true,
    hasAnswers: false,
    hasRevisionStyle: false,
    hasWatermark: false,
  },
};

export const TEMPLATE_META_LIST: TemplateMeta[] = Object.values(TEMPLATE_META);
