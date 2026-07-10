import type { TemplateId } from "../lib/types";

/**
 * Example documents — one per template, written as real study material.
 * Together they exercise nearly every formatting capability: heading
 * hierarchy, tables, nested & task lists, every callout type, footnotes,
 * highlights (==…==), underline (++…++), super/subscript, block quotes,
 * page breaks and MCQ metadata. Opened from Library → Examples.
 */

export interface DemoDoc {
  id: string;
  template: TemplateId;
  title: string;
  subtitle: string;
  paper: string;
  description: string;
  body: string;
}

export const DEMOS: DemoDoc[] = [
  {
    id: "demo-notes",
    template: "notes",
    title: "Fundamental Rights — Complete Notes",
    subtitle: "Articles 12–35 with doctrines, cases and exam angles",
    paper: "Paper 2 · Indian Government & Politics",
    description: "Long-form theory notes: chapters, tables, callouts, footnotes and highlights.",
    body: `# Fundamental Rights: The Conscience of the Constitution

Part III of the Constitution (Articles 12–35) guarantees **Fundamental Rights** — justiciable limits on state power that Granville Austin called the "conscience of the Constitution".[^austin]

::: definition State (Article 12)
For Part III, *State* includes the Government and Parliament of India, state governments and legislatures, and **all local or other authorities** within India or under the control of the Government of India.
:::

## Why "Fundamental"?

They are fundamental in two senses:

1. **Normative** — they protect the dignity essential to a democratic life.
2. **Legal** — an aggrieved person may move the ==Supreme Court directly under Article 32==, itself a fundamental right.

> "An Act of the legislature repugnant to a fundamental right is, to the extent of the repugnancy, void." — A. K. Gopalan v. State of Madras (1950)

::: exam
Examiners repeatedly test the difference between rights available to **citizens only** (Arts 15, 16, 19, 29, 30) and those available to **all persons** (Arts 14, 20, 21, 22, 25).
:::

## The Six Rights at a Glance

| Right | Articles | Available to | Core idea |
|---|---|---|---|
| Equality | 14–18 | 14: all persons | Rule of law, non-discrimination |
| Freedom | 19–22 | 19: citizens | Six freedoms + due process |
| Against Exploitation | 23–24 | All persons | No trafficking, no child labour |
| Freedom of Religion | 25–28 | All persons | Individual & group liberty |
| Cultural & Educational | 29–30 | Citizens/minorities | Identity and institutions |
| Constitutional Remedies | 32 | All persons | Writ jurisdiction |

### Article 14 — Equality Before Law

Article 14 combines two expressions:

- **Equality before law** (British origin) — negative concept; no one is above the law.
- **Equal protection of the laws** (American origin) — positive concept; ++likes should be treated alike++.

Permissible classification must satisfy a two-part test:

- [ ] The classification rests on an *intelligible differentia*
- [ ] The differentia bears a *rational nexus* to the objective of the law

::: important
**New doctrine:** after *E. P. Royappa* (1974) and *Maneka Gandhi* (1978), arbitrariness itself violates Article 14 — "equality is antithetic to arbitrariness".
:::

\\pagebreak

# Article 21 and the Due Process Revolution

## From Gopalan to Maneka

*A. K. Gopalan* (1950) read "procedure established by law" narrowly — any enacted procedure sufficed. *Maneka Gandhi v. Union of India* (1978) overruled this: the procedure must be ==just, fair and reasonable==, importing substantive due process into Article 21.

::: example
Passport impounded "in the public interest" without a hearing → struck down. The Court held Articles 14, 19 and 21 are not mutually exclusive — the **golden triangle**.
:::

## Rights Read into Article 21

The Court has derived an expanding family of unenumerated rights:

- Right to livelihood — *Olga Tellis* (1985)
- Right to a clean environment — *M. C. Mehta* line of cases
- Right to privacy — *K. S. Puttaswamy* (2017), 9-judge bench
  - Informational privacy
  - Decisional autonomy
- Right to die with dignity — *Common Cause* (2018)

::: tip
Memory hook — **L-E-P-D**: *Livelihood, Environment, Privacy, Dignity*. Recite the case with the right, never the right alone.
:::

## Suspension During Emergency

Under Article 359, enforcement of Part III rights may be suspended — **except Articles 20 and 21** (44th Amendment, 1978).

::: warning
A classic trap: the 44th Amendment protected Articles 20–21 from suspension, but *ADM Jabalpur* (1976) — which had upheld suspension — was formally overruled only in *Puttaswamy* (2017).
:::

::: summary
Part III binds the "State" (Art 12); Article 14 now outlaws arbitrariness; Article 21 requires fair procedure and hosts derived rights; Articles 20–21 survive even an Emergency.
:::

## Notes on Usage

Chemical and mathematical notation render correctly — H~2~O, CO~2~, x^2^ — and ~~struck-through text~~ marks deletions during revision.

[^austin]: Granville Austin, *The Indian Constitution: Cornerstone of a Nation* (1966), ch. 3.
`,
  },

  {
    id: "demo-revision",
    template: "revision",
    title: "Preamble & Basic Structure — Quick Revision",
    subtitle: "One sitting before the exam",
    paper: "Paper 2 · Unit 1",
    description: "Compact revision sheet: rapid-fire bullets, attribution tables, exam callouts.",
    body: `# Preamble — The Identity Card of the Constitution

**One-line thesis:** the Preamble declares the *source* (We, the People), the *nature* (sovereign socialist secular democratic republic) and the *objectives* (justice, liberty, equality, fraternity) of the Indian state.

## Keywords & Insertions

- **Sovereign** — no external authority; India can cede territory (*Berubari*, 1960)
- **Socialist / Secular / Integrity** — inserted by the ==42nd Amendment (1976)==
- **Republic** — elected head of state; no hereditary office
- **Fraternity** — assures *dignity of the individual* and *unity and integrity of the Nation*

## Is the Preamble Part of the Constitution?

| Case | Year | Holding |
|---|---|---|
| Berubari Union | 1960 | Not a part; only a key to the mind of the makers |
| Kesavananda Bharati | 1973 | **Part of the Constitution**; amendable, basic features untouchable |
| LIC of India | 1995 | Reaffirmed: integral part, not enforceable |

::: exam
Asked June 2023, Dec 2024 — the *exact amendment* that inserted each word, and the *case* that settled the Preamble's status.
:::

## Basic Structure — Rapid Fire

1. Judicial invention: **Kesavananda Bharati (1973)**, 7:6 majority
2. Trigger: 24th–29th Amendments and the property-rights battles
3. Article 368 grants amending power, ++not constituent power to destroy identity++
4. Applied to strike down: 39th Amendment cl. (*Indira Nehru Gandhi*, 1975); NJAC (2015)

## Recognised Basic Features

- Supremacy of the Constitution
- Republican & democratic form of government
- Secular character
- Separation of powers
- Federal character
- Judicial review — *Minerva Mills* (1980) added the ==balance between Part III and Part IV==

::: tip
Answer formula: *doctrine → case that born it → two cases that applied it → one criticism* (counter-majoritarian difficulty).
:::

## Self-Check

- [ ] Can I name the four objectives in order?
- [ ] Which words entered in 1976?
- [ ] Majority ratio in Kesavananda?
- [ ] Two laws struck down on basic-structure grounds?
`,
  },

  {
    id: "demo-mcq",
    template: "mcq",
    title: "Indian Constitution — PYQ Drill",
    subtitle: "Previous-year questions with explanations",
    paper: "Practice Set 01",
    description: "MCQ booklet: sections, difficulty/topic/source chips, answer key and explanations.",
    body: `Attempt all questions. Each carries 2 marks; there is no negative marking. Sources are actual previous-year papers.

## Section A — Constitutional Development

Q. The Cabinet Mission Plan (1946) proposed —
A) A federation with three-tier grouping of provinces *
B) Immediate partition into two dominions
C) Direct elections to the Constituent Assembly
D) A unitary state with devolved provinces
Explanation: The Mission rejected partition and proposed a three-tier structure — Union, groups of provinces, and provinces — with the Constituent Assembly elected indirectly by provincial assemblies.
Difficulty: Moderate
Topic: Constitutional Development
Source: UGC-NET Dec 2023

Q. Who moved the Objectives Resolution in the Constituent Assembly?
A) B. R. Ambedkar
B) Rajendra Prasad
C) Jawaharlal Nehru *
D) K. M. Munshi
Explanation: Nehru moved it on 13 December 1946; its ideals were later distilled into the Preamble.
Difficulty: Easy
Topic: Constituent Assembly
Source: UGC-NET June 2022

Q. Match the borrowed features with their sources and select the correct code —
A) Ireland: Directive Principles; USA: Judicial review; UK: Parliamentary system *
B) USA: Directive Principles; Ireland: Judicial review; UK: Rule of law
C) Canada: Directive Principles; USA: Cabinet system; UK: Federal list
D) Australia: Judicial review; USA: Concurrent list; UK: Fundamental duties
Explanation: DPSPs came from the Irish Constitution, judicial review from the American, and the parliamentary executive from the British model.
Difficulty: Moderate
Topic: Sources of the Constitution
Source: CUET-PG 2024

## Section B — Fundamental Rights & Duties

Q. "Procedure established by law" in Article 21 was given a due-process reading in —
A) A. K. Gopalan v. State of Madras
B) Maneka Gandhi v. Union of India *
C) Golak Nath v. State of Punjab
D) Shankari Prasad v. Union of India
Explanation: Maneka Gandhi (1978) held the procedure must be just, fair and reasonable, effectively importing substantive due process.
Difficulty: Easy
Topic: Article 21
Source: UGC-NET Dec 2024

Q. Fundamental Duties were added on the recommendation of —
A) Sarkaria Commission
B) Swaran Singh Committee *
C) Punchhi Commission
D) Balwant Rai Mehta Committee
Explanation: The Swaran Singh Committee (1976) recommended them; the 42nd Amendment inserted Article 51A with ten duties (an eleventh came in 2002).
Difficulty: Easy
Topic: Fundamental Duties
Source: Rajasthan SET 2023

Q. Arrange the following cases chronologically —
A) Golak Nath → Kesavananda → Minerva Mills → Waman Rao *
B) Kesavananda → Golak Nath → Waman Rao → Minerva Mills
C) Golak Nath → Minerva Mills → Kesavananda → Waman Rao
D) Kesavananda → Minerva Mills → Golak Nath → Waman Rao
Explanation: Golak Nath (1967), Kesavananda Bharati (1973), Minerva Mills (1980), Waman Rao (1981).
Difficulty: Hard
Topic: Amendment & Basic Structure
Source: UGC-NET June 2024
`,
  },

  {
    id: "demo-flashcards",
    template: "flashcards",
    title: "Constitutional Articles — Flash Cards",
    subtitle: "Active recall deck",
    paper: "Core Deck",
    description: "Cut-out flash cards: article numbers, doctrines and one-line holdings.",
    body: `# Articles & Doctrines

Fifteen high-yield prompts. Cover the answer, recall, flip.

## Article 12 defines —

**"State"** for Part III — government, legislatures, local and *other authorities*.

## Article 13 provides —

**Judicial review** of pre- and post-constitutional laws inconsistent with Part III.

## Writ of *Habeas Corpus* means —

**"Produce the body"** — against unlawful detention; issued to state and private persons alike.

## Article 32 was called "the heart and soul of the Constitution" by —

**B. R. Ambedkar**, in the Constituent Assembly debates.

## Doctrine of *Eclipse* —

A pre-constitutional law inconsistent with Part III is **not dead, only shadowed** — it revives if the inconsistency is removed (*Bhikaji*, 1955).

## Doctrine of *Severability* —

Only the **offending portion** of a statute is void, if separable (*R.M.D.C.*, 1957).

## Article 15(3) permits —

**Special provisions for women and children** — protective discrimination.

## Article 17 abolishes —

**Untouchability** — enforceable against private individuals too.

## Article 19 freedoms available only to —

**Citizens** (not foreigners, not corporations as such).

## "Golden triangle" of the Constitution —

**Articles 14 + 19 + 21** read together (*Maneka Gandhi*, 1978).

## Article 21A guarantees —

**Free and compulsory education**, ages 6–14 (86th Amendment, 2002).

## Article 25 covers —

Freedom of **conscience, profession, practice and propagation** of religion, subject to public order, morality and health.

## Minority educational rights flow from —

**Article 30** — to establish and administer institutions of choice.

## Right to property today is —

A **constitutional right under Article 300A** (44th Amendment, 1978) — no longer fundamental.

## *Puttaswamy* (2017) held —

**Privacy is a fundamental right** intrinsic to Article 21 — 9-judge unanimous bench.
`,
  },
];
