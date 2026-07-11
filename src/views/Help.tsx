import type { ReactNode } from "react";
import { Button, useToast } from "../components/ui";
import { StudioNav } from "../components/StudioNav";

/**
 * Help — the Polity Studio manual: Markdown syntax with live examples,
 * a template-by-template guide (Notes, Revision, MCQ/PYQ, Flash Cards),
 * ready-made AI prompts per content type, and workspace tips. Content
 * only — no app logic — so it's safe to keep expanding without touching
 * anything else.
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

const MCQ_PROMPT = `Write MCQ practice questions as Markdown for a PDF publishing tool, using exactly this grammar per question:

Q. <question text>
A) <option>
B) <option> *        ← put the trailing * on the correct option
C) <option>
D) <option>
Explanation: <one or two sentences>
Topic: <short topic tag>
Source: <exam/paper reference, or omit if unknown>

- Group questions under "##" section headings (e.g. "## Section A — <topic>").
- Exactly one correct option per question, always marked with a trailing *.
- Keep explanations factual and short — they print in the answer key.
- No difficulty labels, no raw HTML, no YAML front matter.

Topic: <your topic here>. Write <N> questions at genuine exam difficulty, previous-year style where possible.`;

const FLASHCARD_PROMPT = `Write an active-recall flashcard deck as Markdown for a PDF publishing tool:

- Each card is one "##" heading (the front — a question or term) followed by its answer text (the back).
- Keep the front short (a question, not a paragraph) and the back to 1–3 sentences.
- Bold the key term in the back with **term**.
- No raw HTML, no YAML front matter, no images.

Topic: <your topic here>. Write <N> cards covering the most exam-relevant terms and questions.`;

const PYQ_PROMPT = `Write solved previous-year questions (PYQs) as Markdown for a PDF publishing tool, using exactly this grammar per question:

Q1. <question text>
A) <option>
B) <option> *        ← put the trailing * on the correct option
C) <option>
D) <option>
Source: <exam + year, e.g. UGC-NET Dec 2023>
Solution: <2–5 sentences: why the answer is right and why the tempting options are wrong; a small Markdown table is allowed>

- Group questions by paper/topic under "##" section headings.
- Every question needs a Source line (exam + year) and a Solution.
- Exactly one correct option per question, one option per line.
- No raw HTML, no YAML front matter, no difficulty labels.

Exam & topic: <your exam and topic here>. Reproduce <N> genuine previous-year questions with faithful wording where possible.`;

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

LISTS & TABLES
- "- item" bullets · "1. item" numbered · "- [ ]" / "- [x]" task lists.
- GitHub-style tables with a |---|---| separator row; keep cells short.

CALLOUTS (colored boxes)
::: definition Optional Title
Body text.
:::
Types: definition · example · important · summary · tip · warning · note · exam.

QUESTIONS (for MCQ / PYQ documents)
Q1. Question text?
A) option
B) option *        ← trailing * marks the correct option (or add "Answer: B")
C) option
D) option
Solution: worked explanation ("Explanation:" also works)
Topic: short tag
Source: UPSC 2021
- One option per line, A)–E) or 1)–5). Group questions under "##" headings.

FLASHCARDS
- Each "##" heading is a card front; the text under it is the back.

AVOID
- Raw HTML, YAML front matter (--- blocks), images from the web.
- Bold question numbers like "**Q1.**" — write "Q1." plainly.
- Code fences unless showing actual code.`;

const MCQ_EXAMPLE = `## Section A — Greek Political Thought

Q. Who called man "a political animal"?
A) Plato
B) Aristotle *
C) Cicero
D) Locke
Explanation: From Aristotle's Politics, Book I.
Topic: Greek Political Thought
Source: UGC-NET Dec 2023`;

const FLASHCARD_EXAMPLE = `## What is the "basic structure doctrine"?
The principle that Parliament cannot amend the Constitution's core features — laid down in **Kesavananda Bharati v. State of Kerala** (1973).

## Who wrote the Objectives Resolution?
Moved by **Jawaharlal Nehru** in the Constituent Assembly on 13 December 1946.`;

const CALLOUT_EXAMPLE = `::: definition Sovereignty
The supreme authority of a state
within its territory.
:::`;

const IMAGE_EXAMPLE = `![Separation of powers](diagram.png "Fig 1 — the three organs")

![Map](india.png){width=60% align=center}`;

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

export function Help() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-2">
        <StudioNav />
        <div>
          <h1 className="text-xl font-bold">Help &amp; Markdown guide</h1>
          <p className="text-xs text-faint">Everything Polity Studio understands, template by template — with examples.</p>
        </div>
      </header>

      <div className="space-y-5 pb-10">
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
        </Section>

        <Section
          title="Document structure"
          intro="Headings drive the table of contents, PDF bookmarks and the running header on every page."
        >
          <Snippet>{STRUCTURE_EXAMPLE}</Snippet>
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
            A standalone image becomes a centered figure. Add a caption in quotes, and control size &amp; placement with an
            optional <code className="font-mono">{"{width=60% align=left}"}</code> (also <code className="font-mono">align=center|right</code>,{" "}
            <code className="font-mono">fit=cover</code>). Images are downscaled and saved as data URIs, so they travel with the
            document and render identically in the preview and the exported PDF — no web links, nothing to break offline.
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
            <li>Pick the matching template (Notes, MCQ, PYQ…), check the preview, publish.</li>
          </ol>
          <Snippet>{MASTER_SPEC}</Snippet>
          <CopyButton text={MASTER_SPEC} label="Copy specification" />
        </Section>

        <Section title="Templates, one by one" intro="Each template has its own body grammar and its own tuned AI prompt below.">
          <TemplateGuide
            name="Theory Notes"
            forWhat="Long-form chapters — the default for explanatory writing, with a cover, table of contents and callouts."
            grammar={<span>Plain Markdown — headings, paragraphs, tables, callouts, footnotes all apply as above.</span>}
            prompt={NOTES_PROMPT}
          />
          <TemplateGuide
            name="Quick Revision"
            forWhat="Compact, bullet-first sheets for last-minute review — same Markdown as Notes, laid out tighter."
            grammar={<span>Plain Markdown, but favor short bullets over paragraphs — the print style is denser and skips ceremony.</span>}
            prompt={REVISION_PROMPT}
          />
          <TemplateGuide
            name="MCQ Booklet"
            forWhat="Practice questions where answers sit in a back-of-booklet key with explanations — a clean test to attempt first, then check."
            grammar={
              <span>
                <code className="font-mono">Q.</code> starts a question, <code className="font-mono">A)</code>…
                <code className="font-mono">D)</code> are options, a trailing <code className="font-mono">*</code>{" "}
                (or <code className="font-mono">Answer: B</code>) marks the correct one.{" "}
                <code className="font-mono">Explanation: / Topic: / Source:</code> lines are optional. Use{" "}
                <code className="font-mono">##</code> headings to split into sections.
              </span>
            }
            prompt={MCQ_PROMPT}
          />
          <TemplateGuide
            name="PYQ Collection"
            forWhat="Solved previous-year questions — each shows its exam/year badge, the correct answer and a worked solution right under it (no back-of-book flipping). Best target when you paste a solved paper."
            grammar={
              <span>
                Same grammar as MCQ. Add <code className="font-mono">Source: UPSC 2021</code> (or{" "}
                <code className="font-mono">Exam: / Year:</code>) for the badge and{" "}
                <code className="font-mono">Solution:</code> (also <code className="font-mono">Detailed Solution:</code>) for the
                worked answer — tables inside a solution render as tables. Pasting or importing a real paper fills these in
                automatically.
              </span>
            }
            prompt={PYQ_PROMPT}
          />
          <TemplateGuide
            name="Flash Cards"
            forWhat="Active-recall decks for spaced repetition — one card per term or question."
            grammar={<span>Each <code className="font-mono">##</code> heading is the front of a card; the text under it is the back.</span>}
            prompt={FLASHCARD_PROMPT}
          />
        </Section>

        <Section title="MCQ / PYQ example">
          <Snippet>{MCQ_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            The answer key and explanations position (end of booklet, inline under each question, or hidden) is chosen
            in the document's Settings pane.
          </p>
        </Section>

        <Section title="Flash card example">
          <Snippet>{FLASHCARD_EXAMPLE}</Snippet>
        </Section>

        <Section title="Common mistakes" intro="The handful of things that trip up imported content — all easy to avoid.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>The whole reply wrapped in a code fence</b> — some chat UIs copy Markdown inside ``` fences. Delete the fence lines; otherwise the document renders as one code block.</li>
            <li><b>Bold question numbers</b> (<code className="font-mono text-xs">**Q1.**</code>) — the question parser needs a plain <code className="font-mono text-xs">Q1.</code> at the start of the line.</li>
            <li><b>Two options on one line</b> (<code className="font-mono text-xs">A) x B) y</code>) — Smart Import repairs this when you paste a real exam paper, but ask your AI for one option per line to be safe.</li>
            <li><b>No correct answer marked</b> — without a trailing <code className="font-mono text-xs">*</code> or an <code className="font-mono text-xs">Answer:</code> line, the question prints with no key entry. The Booklet check in the settings pane flags these.</li>
            <li><b>Raw HTML</b> (<code className="font-mono text-xs">&lt;br&gt;</code>, <code className="font-mono text-xs">&lt;table&gt;</code>) — ignored by design; use Markdown tables and blank lines instead.</li>
            <li><b>Linking an image by web URL</b> — a remote <code className="font-mono text-xs">![](https://…)</code> can fail on export (offline/cross-origin). Paste, drag in or upload the picture instead — it's embedded in the document and always survives.</li>
            <li><b>An unclosed callout</b> — every <code className="font-mono text-xs">::: type</code> needs its closing <code className="font-mono text-xs">:::</code> line, or the rest of the document lands inside the box.</li>
          </ul>
        </Section>

        <Section title="Working efficiently" intro="The workspace has a few features worth knowing about.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li><b>Ctrl/Cmd+K</b> opens universal search — jump to any document, or run a command (new document, import, theme, backup) from anywhere.</li>
            <li><b>Ctrl/Cmd+F</b> in the editor opens Find &amp; Replace; the toolbar's search icon does the same.</li>
            <li><b>Focus mode</b> (the frame icon in the editor header) hides the toolbar and settings pane for distraction-free writing — toggle it off to bring them back.</li>
            <li>The settings and preview panes are resizable by dragging their edges, and collapsible to a thin rail when you need the width back.</li>
            <li>In the <b>Flow</b> preview, click the cover title, subtitle or any heading to edit it right there — it writes straight back to your Markdown.</li>
            <li>The <b>Pages</b> preview shows the exact pages you'll publish — headers, footers, watermark and all — with pinch/±/fit-width/fit-page zoom.</li>
            <li>Smart Import converts pasted Word, Google Docs, web and AI-chat content automatically; drag a <code className="font-mono text-xs">.md</code>, <code className="font-mono text-xs">.txt</code>, <code className="font-mono text-xs">.html</code> or <code className="font-mono text-xs">.docx</code> file onto the Library (new documents) or the editor (inserts at the cursor) — either way you get a review step to confirm or edit before anything is saved.</li>
            <li>Paste or import a raw <b>exam paper</b> and Smart Import restructures it into clean questions on its own — it recognises <code className="font-mono text-xs">Q.</code> / <code className="font-mono text-xs">Que.</code> / <code className="font-mono text-xs">[3/23]</code> numbering, statement lists, the real options (even two to a line), the answer and the worked solution, tags the exam/year, and strips page-number noise. Pick <b>PYQ Collection</b> in the review for the solved layout.</li>
            <li>Select several documents in the Library (the checklist icon) to merge them into one PDF, each starting on its own page.</li>
            <li><b>Home</b>, <b>Resume last session</b> and <b>Restart Studio</b> in the header work from anywhere — resume reopens your last document at the exact cursor line; restart safely reloads the app (autosave already covers your work).</li>
          </ul>
        </Section>

        <Section title="Branding, covers & the dark reading theme" intro="Settings → Branding drives every export; Details drives one document.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Cover style, table of contents, watermark, page size and text density are all per-document, in the settings pane (the sliders icon).</li>
            <li>Each cover style also accepts optional background, heading and accent color overrides, right below the style picker — leave any of them unset to keep the style's own palette.</li>
            <li><b>Custom — design your own</b> opens the Cover Designer: background gradient (two colors + angle), text and accent colors, a vector pattern with adjustable strength, title font and size, left or centered layout, a hairline frame, the temple emblem, and your own uploaded logo. It starts from the preset you were using and previews live on the cover.</li>
            <li>Settings → Appearance has two separate themes: the <b>app theme</b> (this UI) and the <b>document reading theme</b> (how previews, PDFs and HTML exports render) — the preview toolbar's sun/moon icon toggles the latter without leaving the editor.</li>
            <li>Institute name, links, watermark text and the PDF color palette live in Settings → Branding and apply to every document.</li>
          </ul>
        </Section>

        <Section title="Good to know">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Everything autosaves as you type; documents live in this browser (back them up in Settings → Your data).</li>
            <li>YAML front matter (<code className="font-mono text-xs">--- … ---</code>) pasted from other tools is ignored automatically.</li>
            <li>Publish PDF opens a full review of the real typeset pages before you download — what you approve is exactly what downloads, as a true vector PDF (small, selectable text, no print dialog).</li>
            <li>Download HTML (next to Download PDF) gives the same pages as a small, offline, instantly-opening web page — handy for sharing without a PDF reader.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
