import type { ReactNode } from "react";
import { Button, useToast } from "../components/ui";
import { StudioNav } from "../components/StudioNav";
import { downloadFile } from "../lib/utils";

/** Keep this in lockstep with package.json's "version" — shown in the
    "What's new" heading and stamped into the downloaded guide so it's
    obvious which app build a saved copy matches. */
const STUDIO_VERSION = "4.8.0";

/**
 * Help — the Polity Studio manual: Markdown syntax with live examples,
 * a template-by-template guide (Notes, Question Bank, Revision,
 * Universal), ready-made AI prompts per content type, and workspace
 * tips. Content only — no app logic — so it's safe to keep expanding
 * without touching anything else.
 */

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-edge bg-surface p-5">
      <h2 className="text-sm font-bold">{title}</h2>
      {intro && <p className="mt-0.5 text-xs text-faint">{intro}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

/** One "type this → you get" row. */
function Ex({ code, result }: { code: string; result: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-2">
      <pre className="overflow-x-auto rounded-lg bg-raised px-3 py-2 font-mono text-xs leading-relaxed text-ink-2">{code}</pre>
      <div className="px-1 text-sm">{result}</div>
    </div>
  );
}

function Snippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-raised px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-2">{children}</pre>
  );
}

function CopyButton({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <Button
      icon="copy"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => toast("Prompt copied — paste it into your AI tool", "ok"))
          .catch(() => toast("Couldn't access the clipboard", "error"));
      }}
    >
      {label}
    </Button>
  );
}

/** A template card: what it's for, its own body grammar in brief, and a
    copyable AI prompt tuned for that content type. */
function TemplateGuide({ name, forWhat, grammar, prompt }: { name: string; forWhat: string; grammar: ReactNode; prompt: string }) {
  return (
    <div className="rounded-xl border border-edge p-4">
      <h3 className="text-sm font-bold">{name}</h3>
      <p className="mt-0.5 text-xs text-faint">{forWhat}</p>
      <div className="mt-3 text-xs text-ink-2">{grammar}</div>
      <details className="mt-3 group">
        <summary className="cursor-pointer text-xs font-semibold text-accent">AI prompt for {name.toLowerCase()}</summary>
        <div className="mt-2 space-y-2">
          <Snippet>{prompt}</Snippet>
          <CopyButton text={prompt} />
        </div>
      </details>
    </div>
  );
}

const NOTES_PROMPT = `Write study notes as Markdown for a PDF publishing tool. Follow these rules exactly:

- Use "#" for the chapter title and "##" / "###" for sections — the table of contents is built from them.
- Plain paragraphs, **bold** for key terms, *italic* for emphasis, ==highlight== for must-remember phrases.
- Use Markdown tables for comparisons, and numbered/bulleted lists for enumerations.
- For definitions, exam pointers and warnings, use callout blocks:
  ::: definition Term
  One-sentence definition.
  :::
  (available types: definition, example, important, summary, tip, warning, note, exam)
- Footnotes with [^1] markers and matching [^1]: entries are supported.
- Write "\\pagebreak" alone on a line to force a new PDF page.
- Cross-references like "see Table 2" or "see Note 3" become clickable links in the PDF automatically.
- Do NOT use raw HTML, YAML front matter, images from the web, or code fences unless showing actual code.

Topic: <your topic here>. Aim for clear, exam-oriented prose with one "exam" callout per major section.`;

const REVISION_PROMPT = `Write a quick-revision sheet as Markdown for a PDF publishing tool — compact, scannable, no long paragraphs:

- "#" for the sheet title, "##" for each topic block.
- Prefer short bullet points over prose; bold the term being defined.
- Use ==highlight== only for the single most exam-critical fact per bullet.
- Use one "tip" or "exam" callout per topic block for a memory aid or likely question angle, not more.
- Keep the whole thing skimmable in under 5 minutes.
- No raw HTML, no YAML front matter, no images.

Topic: <your topic here>. Summarize only what a student needs the night before the exam.`;

const QUESTIONS_PROMPT = `Write questions as Markdown for a PDF publishing tool, using exactly this grammar per question:

Q. <question text>
A) <option>
B) <option> *        ← put the trailing * on the correct option (or add "Answer: B")
C) <option>
D) <option>
Topic: <short topic or unit tag — shown in the question header>
Source: <exam + year, e.g. UGC-NET Dec 2023 — shown in the question header; omit if unknown>
Solution: <optional worked solution, 2–5 sentences; "Explanation:" also works; a small Markdown table is allowed>

- Group questions under "##" section headings (e.g. "## Unit 5 — Comparative Politics").
- Exactly one correct option per question, one option per line.
- The Topic and Source lines print label-free as rounded badges in each question's header row (number · topic badge · source badge) — write them as clean display text.
- A question without a Solution simply prints without one — no space is wasted.
- No difficulty labels, no raw HTML, no YAML front matter.

Exam & topic: <your exam and topic here>. Write <N> questions at genuine exam difficulty — previous-year questions with faithful wording where possible, or fresh practice questions in the same style.`;

const UNIVERSAL_PROMPT = `Write a document as Markdown for a PDF publishing tool. This is a free-form document — essays, answer frameworks, syllabi, glossaries, plans — so use whatever structure fits:

- "#" for the title, "##" / "###" for sections — the table of contents is built from them.
- All standard Markdown applies: **bold**, *italic*, ==highlight==, tables, lists, task lists, footnotes, quotes.
- Callout boxes for anything worth boxing:
  ::: tip Optional Title
  Body text.
  :::
  (types: definition, example, important, summary, tip, warning, note, exam)
- "\\pagebreak" alone on a line forces a new PDF page.
- No raw HTML, no YAML front matter, no images from the web.

Request: <describe the document you want here>.`;

/** The complete authoring contract, in one copyable block — paste it
    into any AI tool before your request and the reply imports clean.
    Keep this in lockstep with markdown/renderer.ts and markdown/mcq.ts. */
const MASTER_SPEC = `POLITY STUDIO — MARKDOWN SPECIFICATION
Follow these rules exactly. Output plain Markdown only — no code fence around the document, no raw HTML, no YAML front matter.

STRUCTURE
- "# Title" once at the top (becomes the document title).
- "## Section" and "### Sub-section" build the table of contents and the running page header.
- "\\pagebreak" alone on a line forces a new PDF page.

TEXT
- **bold** key terms · *italic* emphasis · ==highlight== must-remember phrases · ++underline++ · ~~strikethrough~~
- x^2^ superscript · H~2~O subscript · \`inline code\`
- [text](https://example.com) links · "> " quotations
- Footnotes: [^1] in the text plus a matching "[^1]: note" line below.
- Arrow shortcuts in plain text: -> => <- <-> become → ⇒ ← ↔ (skipped inside code).
- Cross-references in plain text — "Question 42", "Q7", "Table 3", "Figure 2", "Diagram 2", "Note 15" — become clickable internal links in the preview, PDF and HTML export automatically.

LISTS & TABLES
- "- item" bullets · "1. item" numbered · "- [ ]" / "- [x]" task lists.
- GitHub-style tables with a |---|---| separator row; keep cells short.

CALLOUTS (colored boxes)
::: definition Optional Title
Body text.
:::
Types: definition · example · important · summary · tip · warning · note · exam.

QUESTIONS (for Question Bank documents)
Q1. Question text?
A) option
B) option *        ← trailing * marks the correct option (or add "Answer: B")
C) option
D) option
Topic: short topic/unit tag (question header, center)
Source: UPSC 2021 (question header, right)
Solution: optional worked explanation ("Explanation:" also works)
- One option per line, A)–E) or 1)–5). Group questions under "##" headings.

AVOID
- Raw HTML, YAML front matter (--- blocks), images from the web.
- Bold question numbers like "**Q1.**" — write "Q1." plainly (tolerated if it happens, but plain markers are cleanest).
- Code fences unless showing actual code.`;

const QUESTIONS_EXAMPLE = `## Unit 1 — Greek Political Thought

Q. Who called man "a political animal"?
A) Plato
B) Aristotle *
C) Cicero
D) Locke
Topic: Greek Political Thought
Source: UGC-NET Dec 2023
Solution: From Aristotle's Politics, Book I — the polis precedes the individual.`;

const CALLOUT_EXAMPLE = `::: definition Sovereignty
The supreme authority of a state
within its territory.
:::`;

const IMAGE_EXAMPLE = `![Separation of powers](diagram.png "Fig 1 — the three organs")

![Map](india.png){width=60% align=center border}

![Portrait](ambedkar.png){align=left width=22% round shadow}
Text after a left- or right-aligned image wraps naturally
beside it, book-style; the next heading, table, callout or
list always starts clear below the image.`;

const STRUCTURE_EXAMPLE = `# Chapter Title        ← starts the TOC
Intro paragraph…

## Section             ← running header topic
### Sub-section

\\pagebreak             ← force a new page`;

const TABLE_EXAMPLE = `| Feature | Federal | Unitary |
|---|---|---|
| Powers | Divided by constitution | Centralized |
| Example | USA, India | UK, France |

- [ ] Read this chapter
- [x] Highlight key terms
[^1]: A footnote, collected at the end.`;

const XREF_EXAMPLE = `The doctrine is summarized in Table 2 — compare it
with the holding discussed in Question 14, the map in
Figure 3 and the caveat in Note 5.`;

/** Assembles the on-page reference material into one self-contained
    Markdown file — built from the same constants this page renders, so a
    downloaded copy never drifts from what's shown here. Meant to be
    uploaded to an AI chat as context before asking it to write content
    for this app. */
function buildGuideMarkdown(): string {
  return `# Polity Studio — Markdown & Authoring Guide (v${STUDIO_VERSION})

This is the complete authoring reference for Polity Studio, a Markdown-to-PDF
publishing tool for exam-prep content. Give this whole file to an AI chat
(Claude, Gemini, ChatGPT…) as context before asking it to write a document —
its output will import with zero manual formatting.

## Syntax specification

${MASTER_SPEC}

## Document structure

\`\`\`
${STRUCTURE_EXAMPLE}
\`\`\`

## Tables, lists & footnotes

\`\`\`
${TABLE_EXAMPLE}
\`\`\`

## Cross-references (clickable in the PDF)

\`\`\`
${XREF_EXAMPLE}
\`\`\`

Plain-text references — "Question 42" / "Q7", "Table 3", "Figure 2" /
"Diagram 2", "Note 15" — turn into internal links automatically: clickable
in both previews, the exported PDF (real PDF destinations, working in
Chrome, Adobe Reader, Edge, Drive and every standard reader) and the HTML
export. Tables and figures are numbered in document order; "Note N" points
at footnote N; "Question N" points at question N in a Question Bank.
The table of contents is clickable the same way, and every chapter/section
also lands in the PDF's bookmark outline.

## Images

\`\`\`
${IMAGE_EXAMPLE}
\`\`\`

A standalone image becomes a figure. Caption in quotes; layout and styling
via an optional \`{…}\` block:

- **Layout** — \`align=center\` (default), \`align=left\` / \`align=right\`
  (text wraps beside it, book-style), \`align=full\` (full column width).
  Wrapped text stops cleanly: headings, tables, callouts and lists always
  start below the image, never beside or under it.
- **Size** — any percentage of the text column, e.g. \`width=22%\` for a
  small author portrait (1–60% for wrapped images, 1–100% centered);
  \`width=18%\`/\`35%\`/\`65%\` are the XS/S/M shortcuts, omit for natural
  size (L). Any CSS length works too (\`width=220px\`).
- **Spacing** — \`gap=sm|md|lg\` controls the margin around the image (and
  the gap to wrapped text).
- **Styling** — \`border\`, \`round\` (rounded corners), \`shadow\` (a light
  lift; preview/HTML only — the PDF stays crisp), \`fit=cover\`.

Every option is also on the image toolbar (with a width slider), so you
rarely type this by hand. Older \`{width=… align=…}\` images keep working
unchanged.

## Callouts

Eight types: definition · example · important · summary · tip · warning · note · exam.

\`\`\`
${CALLOUT_EXAMPLE}
\`\`\`

## Document types

### Theory Notes
Long-form chapters — the default for explanatory writing, with a cover, table of contents and callouts. Plain Markdown throughout.

AI prompt:
\`\`\`
${NOTES_PROMPT}
\`\`\`

### Question Bank
PYQs, MCQs, mixed banks and practice sets in one examination-book layout. Each question's header is one compact line — the question number, the topic as a rounded badge, and the source as a gold-outlined badge (label-free). The opening line of the question reads slightly stronger than the rest; options sit lighter, so the hierarchy is obvious at a glance. The answers mode decides what each card reveals:

- **Inline** (default) — the study layout: correct option highlighted with a ✓, worked solution under the question when one exists.
- **At the end** — a practice test: clean cards, answer key + explanations at the back.
- **Hidden** — a plain question paper.

\`\`\`
${QUESTIONS_EXAMPLE}
\`\`\`

AI prompt:
\`\`\`
${QUESTIONS_PROMPT}
\`\`\`

### Quick Revision
Compact, bullet-first sheets for last-minute review — same Markdown as Notes, laid out tighter.

AI prompt:
\`\`\`
${REVISION_PROMPT}
\`\`\`

### Universal
The flexible do-anything document — essays, answer frameworks, syllabi, glossaries, plans. Full Markdown, no chapter ceremony, no forced page breaks.

AI prompt:
\`\`\`
${UNIVERSAL_PROMPT}
\`\`\`

## Common mistakes to avoid

- The whole reply wrapped in a single code fence — delete the fence lines, or the document renders as one code block.
- Bold question numbers (\`**Q1.**\`) — write a plain \`Q1.\` at the start of the line.
- Two options on one line (\`A) x B) y\`) — one option per line.
- No correct answer marked — mark it with a trailing \`*\` or an \`Answer: B\` line.
- Raw HTML (\`<br>\`, \`<table>\`) — use Markdown tables and blank lines instead.
- Linking an image by a web URL — paste, drag in or upload the picture instead so it survives offline export.
- An unclosed callout — every \`::: type\` needs its closing \`:::\` line.

## Editor features worth knowing

- The toolbar keeps everyday tools visible; the More (⋯) menu holds the rest (text styles, tables, page breaks, whole-document copy/cut/paste/replace). Every action in More has a pin toggle — Pin to Toolbar / Remove from Toolbar — so you can build your own always-visible bar; the layout is remembered per browser.
- On touch devices, the editor starts keyboard-free: tapping to place the cursor, selecting text and toolbar formatting all leave the on-screen keyboard closed. Tap the "Tap to type" pill in the editor's bottom-left corner to switch into typing mode (opens the keyboard) and back out again.
- The toolbar is selection-aware: with text selected, a callout or the code block wraps the selected text, headings/lists/quote transform the selected lines, inline styles wrap the exact selection, and the clipboard paste replaces it. With nothing selected the same buttons insert their usual templates.
- Editor and preview scroll independently — reading one never disturbs the other. To sync them on purpose, click a line in the editor (or the preview) to place the cursor there, or drag the editor's scrollbar; the preview maps to the same body position (the generated cover/contents pages don't skew it). Clicking in the preview works both ways — in Flow or Pages view it scrolls the editor to the matching line and flashes it. Small Go-to-Top / Go-to-Bottom buttons fade in on each pane once you've scrolled — a single tap jumps instantly to the end, press-and-hold glides smoothly.
- Editing a Publication or Cover field peeks the preview at the cover; editing an Interior (layout) field peeks at your last-viewed inside page — both return to where you were when you move on.
- Inserting or tapping an image shows a toolbar for its layout (left/center/right/full), size, spacing, border, rounded corners, shadow and caption — the same controls appear right in the Flow preview, updating the document live.
- "Replace with clipboard" (in the More menu) swaps the whole document for the clipboard's text, with a confirmation if the document isn't empty — separate from a normal paste at the cursor.
- Ctrl/Cmd+F opens the Search Navigator — an in-document find/replace whose results are grouped by heading and estimated page; click any result to jump straight to it. Ctrl/Cmd+K opens universal search and commands across every document.
`;
}

export function Help() {
  const toast = useToast();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-2">
        <StudioNav />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Help &amp; Markdown guide</h1>
          <p className="text-xs text-faint">Everything Polity Studio understands, template by template — with examples.</p>
        </div>
        <Button
          icon="download"
          onClick={() => {
            downloadFile(`polity-studio-guide-v${STUDIO_VERSION}.md`, buildGuideMarkdown(), "text/markdown");
            toast("Guide downloaded — upload it to any AI chat as context", "ok");
          }}
        >
          <span className="hidden sm:inline">Download Guide (.md)</span>
        </Button>
      </header>

      <div className="space-y-5 pb-10">
        <Section title={`What's new — version ${STUDIO_VERSION} (Question Bank redesign)`} intro="A publication-grade Question Bank: denser pages with nothing lost, structured Assertion–Reason blocks, smart option rows, clickable answer navigation, a two-column format, and a pageless web export.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Every page works harder</b> — Question Banks now use a tighter page frame of their own, and a question's options may continue onto the next page under a clearly tagged <i>"Qn · continued"</i> open card (solutions already flowed). Half-empty pages from questions that "didn't fit" are gone; every density mode benefits, Ultra Compact most.</li>
            <li><b>Units open on fresh pages</b> — each <code className="font-mono text-xs">##</code> unit starts a new page, like a printed book's sections (Settings → Interior can turn it off). Unit headers also show a question-count chip.</li>
            <li><b>Assertion–Reason, properly typeset</b> — write <code className="font-mono text-xs">Assertion (A): …</code> and <code className="font-mono text-xs">Reason (R): …</code> on their own lines and they render as independent labeled blocks (Statement I/II works too). And "(R)" now always prints literally — no more stray ® symbols.</li>
            <li><b>Smart option rows</b> — four very short options ("1909 · 1919 · 1935 · 1947") sit on a single line automatically; long options take a full column; everything else keeps the classic two-column grid. Identical in preview, PDF and HTML.</li>
            <li><b>Premium source &amp; solution styling</b> — the source is now a soft gold-filled pill matching the topic's treatment, and every solution opens with a filled Solution chip, so the card hierarchy reads at a glance.</li>
            <li><b>Clickable answer navigation</b> — in "answers at the end" mode every question carries a quiet <i>Answer →</i> chip that jumps to its explanation (or key cell), and every explanation carries <i>↩ Question</i> back — live in the previews, the exported PDF and the HTML export.</li>
            <li><b>Shared solutions, printed once</b> — when several questions share one detailed explanation it prints once; the others show a clickable <i>"See Question N for the detailed explanation"</i>, and the original lists the questions it also answers.</li>
            <li><b>Hide topics for maximum density</b> — a new setting drops the per-question header row entirely: the number folds into the question line and the source rides at the stem's end. A full row saved on every question.</li>
            <li><b>Two-column examination layout</b> — the classic printed-PYQ-book format, one tap in Settings → Interior: about 20% fewer pages on medium banks, with unit headers spanning both columns.</li>
            <li><b>Pageless web export</b> — Publish gains a second HTML button: a continuous-scroll, script-free reading page (fonts embedded) for websites and phones — no pagination at all.</li>
            <li><b>Android tablet fix</b> — the three-pane workspace headers now sit on one clean line on touch devices; a tablet-only rule was inflating the Flow/Pages switch past its row. Header icon spacing is consistent across all views.</li>
          </ul>
        </Section>

        <Section title="Version 4.7 (Search, Settings & Sync)" intro="Universal homepage search, a Settings panel reorganised into three clear sections, aligned three-pane headers, and click-anywhere sync that works both ways.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Universal homepage search</b> — the Library search now looks inside every document's title, full content <i>and</i> metadata (exam, unit, session, author), not just titles. Each result shows how many times your term appears; open the <b>matches</b> breakdown to see where — grouped by heading with an estimated page — and tap any row to jump straight to that spot in the editor.</li>
            <li><b>Settings in three sections</b> — the editor's Settings pane is now <b>Publication</b> (all cover text &amp; metadata), <b>Cover</b> (the compact design picker) and <b>Interior</b> (page layout, colour palettes, presets). Cleaner to scan, less scrolling.</li>
            <li><b>Compact cover picker + favourites</b> — the three presets and your favourite saved designs sit on one tidy row of chips. Star any saved design (in “Manage saved designs”) to pin your top three beside the presets.</li>
            <li><b>Covers follow light/dark</b> — the cover now adapts automatically to the global reading-theme toggle, deepening in dark mode so it sits calmly against dark interior pages — no separate cover switch.</li>
            <li><b>Interior colour palettes</b> — three premium palettes (Oxford Navy, Forest Emerald, Claret &amp; Copper) applied in one tap, plus your own saved palettes. Customise the exact colours and <b>Save palette</b> to reuse them.</li>
            <li><b>Live layout preview</b> — changing any Interior setting parks the preview on your last-viewed inside page (or the first content page) so you see density, size, TOC and palette changes land immediately.</li>
            <li><b>Two-way click sync</b> — clicking in the <i>preview</i> now reliably scrolls the editor to the matching line and flashes it, in both Flow and Pages views — the exact mirror of clicking in the editor. The top headers of all three panes now line up on one clean row.</li>
          </ul>
        </Section>

        <Section title="Version 4.4 — Reliable at any size" intro="Very large documents lay out and export dependably — visibly, responsively, and even with the app in the background.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Large exports always finish</b> — page layout used to pause forever if you switched apps or the screen locked mid-way (the browser suspends the timer it ran on). It now keeps going in the background and speeds back up when you return, so a 1000-page book reliably reaches its PDF.</li>
            <li><b>Live layout progress</b> — Pages and Publish show a running "Laying out pages… N" count, and the app stays responsive while a big document is being typeset. If layout ever genuinely stalls, the Studio recovers the pages already laid out instead of hanging.</li>
            <li><b>Smooth scrolling at any size</b> — the Pages view now renders only the pages near your viewport, so scrolling and zooming a 1000-page preview feels the same as a 10-page one.</li>
            <li><b>Question Bank: smarter page breaks</b> — a question (stem + options) is never split, but a long solution now continues naturally onto the next page as an elegant open card instead of dragging the whole question — and its white space — to a new page. Solution-heavy banks come out noticeably shorter (about 16% fewer pages in testing), with the same content.</li>
            <li><b>Truer page estimates for question banks</b> — before the first full layout, the Flow view's ≈ page estimate now understands cards, options and solutions rather than treating them as prose, so it lands much closer to the real count.</li>
          </ul>
        </Section>

        <Section title="Version 4.2.2 — Smaller PDFs" intro="Exported PDFs are noticeably smaller on large documents, with pixel-identical typography and branding.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>~30% smaller PDFs on big documents</b> — the temple emblem in every footer and watermark, plus the Telegram and WhatsApp icons, are now stored once and reused on every page instead of being redrawn page by page. A long study set exports around a third smaller (e.g. a 180-page notes set drops from ~1.1&nbsp;MB to ~0.75&nbsp;MB) — with the branding pixel-identical on screen and in print.</li>
          </ul>
        </Section>

        <Section title="Version 4.2 — Performance & polish" intro="Large documents build faster, the Question Bank looks more premium, and images size from 1% to full width.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Faster on big documents</b> — the preview no longer parses your Markdown twice on every rebuild (once for the body, once for the contents). On a 1000-page set of notes that roughly halves the rebuild's parsing work, so typing and preview updates stay smooth as documents grow.</li>
            <li><b>Lighter pages</b> — the temple emblem repeated in every footer and watermark is now a single vector shape instead of six, trimming ~8% of the page-layout nodes (and a bigger share of the vector ones). Large documents lay out a little faster and use less memory — with the mark pixel-identical on screen and in the PDF.</li>
            <li><b>Question Bank, more premium</b> — softer card corners, a confident textbook spine, a rounded number badge, the correct option framed in a soft green, and a small accent before every <em>Solution</em> — refreshed in every density (including Ultra Compact) and in both light and dark, with no extra weight in the PDF.</li>
            <li><b>Image size 1–100%</b> — the width slider now goes all the way down to 1% for a tiny inline mark, still up to full column width.</li>
            <li><b>Cleaner Markdown export</b> — a <code className="font-mono text-xs">.md</code> download keeps your images in full and drops only the Studio-only layout hints, so it opens tidily in any editor; a JSON backup still restores everything, layout included.</li>
          </ul>
        </Section>

        <Section title="Version 4.1 — refinement pass" intro="Polish on the four-type architecture.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>One page count everywhere</b> — once Pages (or Publish) has laid the document out, that <em>exact</em> count drives the editor scrollbar and Flow readouts too; until then they show a structural estimate marked <code className="font-mono text-xs">≈</code>.</li>
            <li><b>Editor header essentials</b> — a Light/Dark app toggle always at hand, a quieter one-row Pages toolbar (tap the zoom % to fit width; double-tap and pinch still zoom), and featherweight Go-to-Top/Bottom chevrons.</li>
            <li><b>AI-proof question markers</b> — bolded markers AI chats emit (<code className="font-mono text-xs">**Q1.**</code>, <code className="font-mono text-xs">**A)**</code>, <code className="font-mono text-xs">**Answer:** B</code>) parse automatically.</li>
          </ul>
        </Section>

        <Section title="Version 4.0 — the document architecture" intro="The foundation these releases polish.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Four document types</b> — Theory Notes, Question Bank, Quick Revision, Universal. Older MCQ/PYQ/Flash-Card documents migrated automatically, content untouched.</li>
            <li><b>Question Bank</b> — one examination-book card for PYQs, MCQs and practice sets: ✓ on the correct option, optional inline solution; the <em>Answers &amp; solutions</em> setting switches study / practice / plain-paper layouts.</li>
            <li><b>Ultra Compact density</b> — tightens the whole layout (spacing, margins, tables, cards), not just the font.</li>
            <li><b>Clickable PDF navigation</b> — cross-references like <code className="font-mono text-xs">Question 42</code> / <code className="font-mono text-xs">Table 3</code> become real internal PDF links, alongside clickable contents and a bookmark outline.</li>
          </ul>
        </Section>

        <Section title="The basics" intro="Type on the left, get the right — live in the preview.">
          <Ex code="**bold**" result={<strong>bold</strong>} />
          <Ex code="*italic*" result={<em>italic</em>} />
          <Ex code="==highlight==" result={<mark className="rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-500/40 dark:text-ink">highlight</mark>} />
          <Ex code="++underline++" result={<span className="underline decoration-accent underline-offset-2">underline</span>} />
          <Ex code="~~struck out~~" result={<s className="text-faint">struck out</s>} />
          <Ex code="x^2^  ·  H~2~O" result={<span>x<sup>2</sup> · H<sub>2</sub>O</span>} />
          <Ex code="`inline code`" result={<code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs">inline code</code>} />
          <Ex code="[link text](https://example.com)" result={<span className="text-accent">link text</span>} />
          <Ex code="> A quotation" result={<span className="border-l-2 border-accent pl-2 italic text-ink-2">A quotation</span>} />
          <Ex code="cause -> effect  ·  <->  ·  =>" result={<span>cause → effect · ↔ · ⇒</span>} />
          <Ex code="see Table 3 · Question 42 · Note 15" result={<span>clickable <span className="font-semibold text-accent">internal links</span> — preview, PDF &amp; HTML</span>} />
        </Section>

        <Section
          title="Symbols & arrows"
          intro="Type these ASCII shortcuts and they render as clean symbols — only in normal text, never inside code."
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            <span><code className="font-mono text-xs">-&gt;</code> or <code className="font-mono text-xs">--&gt;</code> → <b>→</b></span>
            <span><code className="font-mono text-xs">&lt;-</code> or <code className="font-mono text-xs">&lt;--</code> → <b>←</b></span>
            <span><code className="font-mono text-xs">&lt;-&gt;</code> → <b>↔</b></span>
            <span><code className="font-mono text-xs">=&gt;</code> or <code className="font-mono text-xs">==&gt;</code> → <b>⇒</b></span>
          </div>
          <p className="text-xs text-faint">
            You can also paste any symbol directly — arrows (→ ← ↔ ⇒ ➜ ➤), ticks and marks (✓ ✔ ✗ ★ •) and the like all render
            in the preview and the exported PDF exactly as typed.
          </p>
        </Section>

        <Section
          title="Document structure"
          intro="Headings drive the table of contents, PDF bookmarks and the running header on every page."
        >
          <Snippet>{STRUCTURE_EXAMPLE}</Snippet>
        </Section>

        <Section
          title="Cross-references — clickable inside the PDF"
          intro="Write a reference in plain text; it becomes an internal link automatically — in both previews, the exported PDF (real PDF destinations: Chrome, Adobe Reader, Edge, Drive…) and the HTML export."
        >
          <Snippet>{XREF_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            <code className="font-mono">Question 42</code> / <code className="font-mono">Q7</code> jump to that question in a Question
            Bank; <code className="font-mono">Table 3</code>, <code className="font-mono">Figure 2</code> /{" "}
            <code className="font-mono">Diagram 2</code> jump to the table or figure counted in document order;{" "}
            <code className="font-mono">Note 15</code> jumps to footnote 15. References inside code, existing links or headings are
            left alone, and a reference whose target doesn't exist stays plain text in the PDF — nothing breaks.
          </p>
        </Section>

        <Section title="Tables, lists & footnotes" intro="All standard Markdown, rendered with the app's own print styling.">
          <Snippet>{TABLE_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            Bullet lists use <code className="font-mono">-</code>, numbered lists use <code className="font-mono">1.</code>, task
            lists use <code className="font-mono">- [ ]</code> / <code className="font-mono">- [x]</code>, and footnotes use{" "}
            <code className="font-mono">[^1]</code> markers with a matching <code className="font-mono">[^1]: note</code> line —
            collected at the end as "Notes &amp; References".
          </p>
        </Section>

        <Section title="Images" intro="Paste a screenshot, drag a picture in, or use the toolbar image button — it's stored inside the document and embeds in the PDF.">
          <Snippet>{IMAGE_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            A standalone image becomes a figure. Add a caption in quotes, then control its <b>layout</b> with an optional{" "}
            <code className="font-mono">{"{…}"}</code>: <code className="font-mono">align=center</code> (default),{" "}
            <code className="font-mono">align=left</code>/<code className="font-mono">right</code> to wrap text beside it book-style, or{" "}
            <code className="font-mono">align=full</code> for the full column. Set any width — down to a small{" "}
            <code className="font-mono">width=15%</code> author portrait (1–60% wrapped, 1–100% centered; a length like{" "}
            <code className="font-mono">220px</code> works too), <code className="font-mono">gap=sm|md|lg</code> for spacing, and any of{" "}
            <code className="font-mono">border</code>, <code className="font-mono">round</code>, <code className="font-mono">shadow</code>,{" "}
            <code className="font-mono">fit=cover</code>. Older <code className="font-mono">{"{width=… align=…}"}</code> images keep
            working unchanged. Images are downscaled and saved as data URIs, so they travel with the document and render identically
            in the preview and the exported PDF. A Markdown export keeps the full image; only the Studio-only{" "}
            <code className="font-mono">{"{…}"}</code> layout hints are dropped so the file opens cleanly anywhere (a JSON backup keeps layout too).
          </p>
          <p className="text-xs text-faint">
            You rarely type any of that: put the cursor on an image line (or tap the picture in the <b>Flow</b> preview) and a
            toolbar gives you the layout, XS/S/M/L sizes plus a fine width slider, spacing, style toggles, caption, replace and
            remove — writing the attributes for you and updating the document live.
          </p>
        </Section>

        <Section
          title="Callouts"
          intro="Colored boxes for the ideas that matter. Eight types: definition · example · important · summary · tip · warning · note · exam."
        >
          <Snippet>{CALLOUT_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            The word after <code className="font-mono">::: type</code> becomes the box title (optional). Close every
            callout with <code className="font-mono">:::</code> on its own line. Insert one from the toolbar's callout
            menu, or type it directly.
          </p>
        </Section>

        <Section
          title="Write with AI — Claude, Gemini, ChatGPT"
          intro="Generate content anywhere, paste it here, publish. The spec below is the whole contract — any AI that follows it produces a document that imports with zero manual formatting."
        >
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Copy the specification below and paste it at the start of your chat (Claude, Google Gemini, ChatGPT — any of them).</li>
            <li>Add your request, e.g. <em>"Notes on Federalism in India, exam-oriented, ~2000 words"</em> — or use a tuned per-template prompt from the next section.</li>
            <li>Copy the AI's reply and paste it into a new document here — Smart Paste cleans up whatever the chat window adds.</li>
            <li>Pick the matching document type (Notes, Question Bank…), check the preview, publish.</li>
          </ol>
          <Snippet>{MASTER_SPEC}</Snippet>
          <CopyButton text={MASTER_SPEC} label="Copy specification" />
        </Section>

        <Section title="Document types, one by one" intro="Each type has its own guide and its own tuned AI prompt below.">
          <TemplateGuide
            name="Theory Notes"
            forWhat="Long-form chapters — the default for explanatory writing, with a cover, table of contents and callouts."
            grammar={<span>Plain Markdown — headings, paragraphs, tables, callouts, footnotes all apply as above. Chapters (<code className="font-mono">#</code>) open on a fresh page with a numbered opener.</span>}
            prompt={NOTES_PROMPT}
          />
          <TemplateGuide
            name="Question Bank"
            forWhat="PYQs, standard MCQs, mixed banks and practice sets — one examination-book layout for all of them."
            grammar={
              <span>
                <code className="font-mono">Q.</code> starts a question, <code className="font-mono">A)</code>…
                <code className="font-mono">D)</code> are options, a trailing <code className="font-mono">*</code>{" "}
                (or <code className="font-mono">Answer: B</code>) marks the correct one.{" "}
                <code className="font-mono">Topic:</code> and <code className="font-mono">Source:</code> fill the label-free
                header row as rounded badges (number · topic · source); <code className="font-mono">Solution:</code> (or{" "}
                <code className="font-mono">Explanation:</code>) adds the optional worked solution. Use{" "}
                <code className="font-mono">##</code> headings to split into units — each unit opens on a fresh page (a
                setting can turn this off). Assertion–Reason and Statement I/II questions format themselves: write{" "}
                <code className="font-mono">Assertion (A): …</code> and <code className="font-mono">Reason (R): …</code> on
                their own lines and they render as independent labeled blocks. Four very short options automatically sit on
                one line; identical detailed solutions print once, with later questions carrying a clickable{" "}
                <em>See Question N</em> reference. The <em>Answers &amp; solutions</em> setting switches between the inline
                study layout (✓ on the correct option, solution under the question), a back-of-book key with clickable{" "}
                <em>Answer →</em> / <em>↩ Question</em> navigation, or a clean question paper. Settings can also hide the
                per-question topic row (the source folds into the question line) and switch the whole bank to the classic
                two-column examination layout.
              </span>
            }
            prompt={QUESTIONS_PROMPT}
          />
          <TemplateGuide
            name="Quick Revision"
            forWhat="Compact, bullet-first sheets for last-minute review — same Markdown as Notes, laid out tighter."
            grammar={<span>Plain Markdown, but favor short bullets over paragraphs — the print style is denser and skips ceremony.</span>}
            prompt={REVISION_PROMPT}
          />
          <TemplateGuide
            name="Universal"
            forWhat="The flexible do-anything document — essays, answer frameworks, syllabi, glossaries, plans, mixed material."
            grammar={<span>Everything from the Markdown guide, with no imposed structure: headings don't force page breaks and there's no chapter numbering — what you write is what you get.</span>}
            prompt={UNIVERSAL_PROMPT}
          />
        </Section>

        <Section title="Question Bank example">
          <Snippet>{QUESTIONS_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            The answers &amp; solutions position (inline under each question, at the end of the booklet, or hidden) is chosen
            in the document's Settings pane. Pasting or importing a real exam paper fills the grammar in automatically.
          </p>
        </Section>

        <Section title="Common mistakes" intro="The handful of things that trip up imported content — all easy to avoid.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>The whole reply wrapped in a code fence</b> — some chat UIs copy Markdown inside ``` fences. Delete the fence lines; otherwise the document renders as one code block.</li>
            <li><b>Bold question numbers</b> (<code className="font-mono text-xs">**Q1.**</code>, <code className="font-mono text-xs">**A)**</code>, <code className="font-mono text-xs">**Answer:** B</code>) — tolerated: the parser strips the bold from the marker automatically. Plain markers are still the cleanest habit.</li>
            <li><b>Two options on one line</b> (<code className="font-mono text-xs">A) x B) y</code>) — Smart Import repairs this when you paste a real exam paper, but ask your AI for one option per line to be safe.</li>
            <li><b>No correct answer marked</b> — without a trailing <code className="font-mono text-xs">*</code> or an <code className="font-mono text-xs">Answer:</code> line, the question prints with nothing highlighted and no key entry. The Booklet check in the settings pane flags these.</li>
            <li><b>Raw HTML</b> (<code className="font-mono text-xs">&lt;br&gt;</code>, <code className="font-mono text-xs">&lt;table&gt;</code>) — ignored by design; use Markdown tables and blank lines instead.</li>
            <li><b>Linking an image by web URL</b> — a remote <code className="font-mono text-xs">![](https://…)</code> can fail on export (offline/cross-origin). Paste, drag in or upload the picture instead — it's embedded in the document and always survives.</li>
            <li><b>An unclosed callout</b> — every <code className="font-mono text-xs">::: type</code> needs its closing <code className="font-mono text-xs">:::</code> line, or the rest of the document lands inside the box.</li>
          </ul>
        </Section>

        <Section title="Working efficiently" intro="The workspace has a few features worth knowing about.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>The formatting toolbar keeps everyday tools visible; the <b>More (⋯)</b> menu holds the rest. Every icon shows its name on hover (desktop) or long-press (touch).</li>
            <li><b>Customizable toolbar</b> — every action listed in More has its own pin toggle: <b>Pin to Toolbar</b> moves it into the always-visible bar, <b>Remove from Toolbar</b> sends it back to More. Your choices are remembered in this browser and survive a refresh.</li>
            <li><b>Keyboard-free selection on tablets</b> — on a touch device the editor starts in a mode where tapping to place the cursor, selecting text and every toolbar formatting action never pop the on-screen keyboard. When you actually want to type, tap the <b>Tap to type</b> pill in the editor's bottom-left corner. Desktop editing is unchanged.</li>
            <li><b>The toolbar is selection-aware</b> — select text first, then tap a callout (Definition, Important, Tip…) or the code block to wrap the <em>selected text</em> in it; headings, bullet/numbered/check lists and quote transform the selected lines; bold/italic/highlight wrap the exact selection; the clipboard paste button replaces it. With nothing selected the same buttons insert their usual templates.</li>
            <li><b>Navigation you control</b> — the editor and preview scroll independently, so reading one never disturbs the other. Sync them on purpose by clicking a line in the editor (or the preview) to place the cursor, or by dragging the editor's scrollbar — the preview then maps to the same <em>body</em> position (the generated cover and contents pages don't skew the mapping). Small <b>Go to Top / Go to Bottom</b> buttons fade in on each pane once you've scrolled — a single tap jumps instantly to the end even in a huge document, press-and-hold glides smoothly, and each pair scrolls only its own pane. The editor scrollbar and both previews also show an estimated <em>page X / Y</em> and percentage; the Pages view stays exact.</li>
            <li><b>Replace with clipboard</b> (in the More menu) swaps the entire document for your clipboard's text — asks first if the document isn't empty. Different from a normal paste, which inserts at the cursor.</li>
            <li><b>Download Guide (.md)</b> (top of this page) exports the complete Markdown reference — syntax, document types, AI prompts, common mistakes — as one file, kept in sync with this page.</li>
            <li><b>Ctrl/Cmd+K</b> opens universal search — jump to any document, or run a command (new document, import, theme, backup) from anywhere.</li>
            <li><b>Ctrl/Cmd+F</b>, or the editor header's search icon, opens the Search Navigator for this document — results are grouped by heading and estimated page with a snippet each; click one to jump straight to it. Replace is one tap away. (Cross-document search is on Ctrl/Cmd+K.)</li>
            <li><b>Table of contents</b> — click any chapter in a document's Contents (in either preview) to jump right to it; in the exported PDF the same links work as real PDF destinations, and chapters land in the reader's bookmark sidebar.</li>
            <li><b>Focus mode</b> (the frame icon in the editor header) hides the toolbar and settings pane for distraction-free writing — toggle it off to bring them back.</li>
            <li>The settings and preview panes are resizable by dragging their edges, and collapsible to a thin rail when you need the width back.</li>
            <li>In the <b>Flow</b> preview, click the cover title, subtitle or any heading to edit it right there — it writes straight back to your Markdown.</li>
            <li>The <b>Pages</b> preview shows the exact pages you'll publish — headers, footers, watermark and all — with pinch/±/fit-width/fit-page zoom.</li>
            <li>Smart Import converts pasted Word, Google Docs, web and AI-chat content automatically; drag a <code className="font-mono text-xs">.md</code>, <code className="font-mono text-xs">.txt</code>, <code className="font-mono text-xs">.html</code> or <code className="font-mono text-xs">.docx</code> file onto the Library (new documents) or the editor (inserts at the cursor) — either way you get a review step to confirm or edit before anything is saved.</li>
            <li>Paste or import a raw <b>exam paper</b> and Smart Import restructures it into clean questions on its own — it recognises <code className="font-mono text-xs">Q.</code> / <code className="font-mono text-xs">Que.</code> / <code className="font-mono text-xs">[3/23]</code> numbering, statement lists, the real options (even two to a line), the answer and the worked solution, tags the exam/year, and strips page-number noise — landing as a ready Question Bank.</li>
            <li>Select several documents in the Library (the checklist icon) to merge them into one PDF, each starting on its own page.</li>
            <li><b>Favourites</b> — tap the star on any Library card to pin that document to a quick-access row at the top of your Library. Starring never changes the "last modified" order.</li>
            <li><b>Library sorting</b> — order the grid by <b>Modified</b> (default, latest first), <b>Created</b> (latest, or oldest for front-to-back course order), <b>Name</b> (A→Z / Z→A) or <b>Size</b> (largest / smallest) from the sort menu beside the search box.</li>
            <li>Each <b>Library card</b> tells you what's inside without opening it — the estimated final PDF pages, the count that matters for its type (chapters, questions or sections), word count and when it was last edited (hover for exact created/modified times).</li>
            <li>During <b>Publish</b>, the typesetting and PDF stages show live progress — current page, total, percentage, elapsed time and an estimated time remaining — so even a very large export is never a black box.</li>
            <li><b>Home</b>, <b>Resume last session</b> and <b>Restart Studio</b> in the header work from anywhere — resume reopens your last document at the exact cursor line; restart safely reloads the app (autosave already covers your work).</li>
          </ul>
        </Section>

        <Section title="The Settings pane, covers & the dark reading theme" intro="The editor's Settings pane (the sliders icon) is organised into three sections: Publication · Cover · Interior.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Publication</b> holds every cover-page text field in one place — publication name, subtitle, unit/institute, feature tags (e.g. “Premium Study Notes”), exam, paper/unit, session, edition, the language badge (cover only — it never changes your content) and author.</li>
            <li><b>Cover</b> is where you include or exclude the cover page and choose its design. Three premium presets — <b>Meridian</b>, <b>Aurora</b> and <b>Eclipse</b> — sit as compact chips alongside your favourite saved designs; each preset accepts optional colour overrides. <b>Custom</b> opens the Cover Designer (colours, a curated pattern, typography, frame and title-box treatments, emblem/logo), previewing live. Use <b>Save this design</b>, then star it in <b>Manage saved designs</b> to pin your top three beside the presets. The cover automatically adapts to the light/dark reading theme — no separate switch.</li>
            <li><b>Interior</b> covers text density (<b>Ultra</b> · Compact · Comfort · Relaxed — Ultra tightens the whole layout, not just the font), page size, table of contents, watermark, (for Question Banks) the answers &amp; solutions position, the <b>interior colour palettes</b> (three premium defaults plus your own saved palettes, applied to every PDF), named layout presets and the PDF filename pattern. Focus any Interior control and the preview jumps to your last-viewed inside page so you see the change land.</li>
            <li>The <b>document reading theme</b> (light/dark) renders previews, PDFs and HTML exports on an eye-friendly dark palette that typesets like a professional dark publication — the preview toolbar's sun/moon icon toggles it without leaving the editor. Covers and the interior palette both follow it.</li>
          </ul>
        </Section>

        <Section title="Good to know">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Everything autosaves as you type; documents live in this browser (back them up in Settings → Your data).</li>
            <li>YAML front matter (<code className="font-mono text-xs">--- … ---</code>) pasted from other tools is ignored automatically.</li>
            <li>Publish PDF opens a full review of the real typeset pages before you download — what you approve is exactly what downloads, as a true vector PDF (small, selectable text, clickable links and bookmarks, no print dialog).</li>
            <li>Download HTML (next to Download PDF) gives the same pages as a small, offline, instantly-opening web page — handy for sharing without a PDF reader.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
