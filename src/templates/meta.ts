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
}

export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  notes: {
    id: "notes",
    name: "Theory Notes",
    description: "Long-form chapters with cover, contents and callouts.",
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    starterTitle: STARTERS.notes.title,
    starter: STARTERS.notes.body,
    hasToc: true,
    hasAnswers: false,
  },
  questions: {
    id: "questions",
    name: "Question Bank",
    description: "PYQs, MCQs and practice sets in an examination-book layout.",
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    starterTitle: STARTERS.questions.title,
    starter: STARTERS.questions.body,
    hasToc: false,
    hasAnswers: true,
  },
  revision: {
    id: "revision",
    name: "Quick Revision",
    description: "Compact bullet points for last-minute review.",
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    starterTitle: STARTERS.revision.title,
    starter: STARTERS.revision.body,
    hasToc: true,
    hasAnswers: false,
  },
  universal: {
    id: "universal",
    name: "Universal",
    description: "A flexible do-anything document — full Markdown, no ceremony.",
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    starterTitle: STARTERS.universal.title,
    starter: STARTERS.universal.body,
    hasToc: true,
    hasAnswers: false,
  },
};

export const TEMPLATE_META_LIST: TemplateMeta[] = Object.values(TEMPLATE_META);
