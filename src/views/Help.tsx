import type { ReactNode } from "react";
import { navigate } from "../lib/router";
import { Button, IconButton, useToast } from "../components/ui";

/**
 * Help — a compact Markdown guide for Polity Studio: the supported
 * syntax with practical examples, how a document should be structured,
 * and a ready-made prompt for generating compatible Markdown with any
 * external AI tool.
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

const AI_PROMPT = `Write study notes as Markdown for a PDF publishing tool. Follow these rules exactly:

- Use "#" for chapter titles and "##" / "###" for sections — the table of contents is built from them.
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

const MCQ_EXAMPLE = `Q. Who called man "a political animal"?
A) Plato
B) Aristotle *
C) Cicero
D) Locke
Explanation: From Aristotle's Politics, Book I.
Difficulty: Easy
Topic: Greek Political Thought
Source: UGC-NET Dec 2023`;

const CALLOUT_EXAMPLE = `::: definition Sovereignty
The supreme authority of a state
within its territory.
:::`;

const STRUCTURE_EXAMPLE = `# Chapter Title        ← starts the TOC
Intro paragraph…

## Section             ← running header topic
### Sub-section

\\pagebreak             ← force a new page`;

export function Help() {
  const toast = useToast();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-2">
        <IconButton label="Back" name="back" size={18} onClick={() => history.length > 1 ? history.back() : navigate("library")} />
        <div>
          <h1 className="text-xl font-bold">Markdown guide</h1>
          <p className="text-xs text-faint">Everything Polity Studio understands — with examples.</p>
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
          <p className="text-xs text-faint">
            Lists use <code className="font-mono">-</code> or <code className="font-mono">1.</code>, tables use pipes
            (<code className="font-mono">| Column | Column |</code>), and footnotes use{" "}
            <code className="font-mono">[^1]</code> markers with a matching <code className="font-mono">[^1]: note</code>{" "}
            line — they are collected at the end as “Notes &amp; References”.
          </p>
        </Section>

        <Section
          title="Callouts"
          intro="Colored boxes for the ideas that matter. Eight types: definition · example · important · summary · tip · warning · note · exam."
        >
          <Snippet>{CALLOUT_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            The word after <code className="font-mono">::: type</code> becomes the box title (optional). Close every
            callout with <code className="font-mono">:::</code> on its own line.
          </p>
        </Section>

        <Section
          title="MCQ booklets"
          intro="In the MCQ template, questions follow a simple grammar — mark the correct option with a trailing *."
        >
          <Snippet>{MCQ_EXAMPLE}</Snippet>
          <p className="text-xs text-faint">
            <code className="font-mono">Explanation / Difficulty / Topic / Source</code> lines are optional. Use{" "}
            <code className="font-mono">##</code> headings to split the paper into sections; the answer key and
            explanations position is chosen in the document’s Settings pane. The Flash cards template is even simpler:
            each <code className="font-mono">##</code> heading is the front of a card, the text below it is the back.
          </p>
        </Section>

        <Section
          title="Generate Markdown with AI"
          intro="Paste this prompt into ChatGPT, Claude, Gemini or any AI tool, add your topic, then paste the result straight into a new document."
        >
          <Snippet>{AI_PROMPT}</Snippet>
          <Button
            icon="copy"
            onClick={() => {
              navigator.clipboard
                .writeText(AI_PROMPT)
                .then(() => toast("Prompt copied — paste it into your AI tool", "ok"))
                .catch(() => toast("Couldn't access the clipboard", "error"));
            }}
          >
            Copy prompt
          </Button>
        </Section>

        <Section title="Good to know">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Everything autosaves as you type; documents live in this browser (back them up in Settings).</li>
            <li>YAML front matter (<code className="font-mono text-xs">--- … ---</code>) pasted from other tools is ignored automatically.</li>
            <li>The <b>Pages</b> preview shows the exact pages you’ll publish — headers, footers, watermark and all.</li>
            <li>Cover titles, subtitles and headings can be edited by clicking them directly in the Flow preview.</li>
            <li>Select several documents in the library to merge them into one PDF.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
