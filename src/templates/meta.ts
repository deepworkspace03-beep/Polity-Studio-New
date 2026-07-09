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
  /** Whether the answers-placement option applies (MCQ). */
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
  mcq: {
    id: "mcq",
    name: "MCQ Booklet",
    description: "Practice questions with answer key and explanations.",
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    starterTitle: STARTERS.mcq.title,
    starter: STARTERS.mcq.body,
    hasToc: false,
    hasAnswers: true,
  },
  flashcards: {
    id: "flashcards",
    name: "Flash Cards",
    description: "Term-and-definition decks for active recall.",
    icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M6 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>',
    starterTitle: STARTERS.flashcards.title,
    starter: STARTERS.flashcards.body,
    hasToc: false,
    hasAnswers: false,
  },
};

export const TEMPLATE_META_LIST: TemplateMeta[] = Object.values(TEMPLATE_META);
