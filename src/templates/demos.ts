import type { TemplateId } from "../lib/types";

/**
 * Example documents — one per template, written as real, exam-grade
 * study material (Indian Polity, public-domain constitutional facts).
 * Each is a full 10–12 page document that exercises nearly every
 * capability of the studio: heading hierarchy, comparative tables,
 * nested & task lists, every callout type, footnotes, highlights,
 * underline, super/subscript, block quotes, timelines, page breaks and
 * rich MCQ metadata. Opened from Library → Examples.
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

/* ── 1 · Theory notes ──────────────────────────────────────────────── */

const NOTES_BODY = `# Fundamental Rights: The Conscience of the Constitution

Part III of the Constitution (Articles 12–35) guarantees **Fundamental Rights** — justiciable limits on state power that Granville Austin called the "conscience of the Constitution".[^austin] They are borrowed in spirit from the American Bill of Rights, but adapted to Indian conditions with explicit reasonable restrictions.

::: definition State (Article 12)
For Part III, *State* includes the Government and Parliament of India, the government and legislature of each state, and **all local or other authorities** within India or under the control of the Government of India. The Supreme Court has read "other authorities" broadly to cover statutory bodies, and even private bodies discharging public functions.
:::

## Why "Fundamental"?

They are fundamental in two distinct senses:

1. **Normative** — they protect the dignity and liberty essential to a democratic life.
2. **Legal** — an aggrieved person may move the ==Supreme Court directly under Article 32==, itself a fundamental right.

> "An Act of the legislature repugnant to a fundamental right is, to the extent of the repugnancy, void." — *A. K. Gopalan v. State of Madras* (1950)

::: exam
Examiners repeatedly test the distinction between rights available to **citizens only** (Articles 15, 16, 19, 29, 30) and those available to **all persons** including foreigners (Articles 14, 20, 21, 22, 25). Learn the two lists cold.
:::

## The Six Rights at a Glance

| Right | Articles | Available to | Core idea |
|---|---|---|---|
| Equality | 14–18 | 14: all persons | Rule of law, non-discrimination |
| Freedom | 19–22 | 19: citizens | Six freedoms + due process |
| Against Exploitation | 23–24 | All persons | No trafficking, no child labour |
| Freedom of Religion | 25–28 | All persons | Individual & group liberty |
| Cultural & Educational | 29–30 | Citizens / minorities | Identity and institutions |
| Constitutional Remedies | 32 | All persons | Writ jurisdiction |

The original Constitution listed seven rights; the **Right to Property** (Article 31) was deleted as a fundamental right by the 44th Amendment (1978) and repositioned as a plain constitutional right under **Article 300A**.

\\pagebreak

# The Right to Equality (Articles 14–18)

## Article 14 — Equality Before Law

Article 14 combines two expressions of different origin:

- **Equality before law** (British / Dicey) — a *negative* concept; no one is above the law and all are equally subject to it.
- **Equal protection of the laws** (American, 14th Amendment) — a *positive* concept; ++likes should be treated alike++ in like circumstances.

Permissible classification must satisfy a **two-part test**:

- [ ] The classification rests on an *intelligible differentia* distinguishing those grouped from those left out.
- [ ] The differentia bears a *rational nexus* to the object the law seeks to achieve.

::: important
**The new doctrine of arbitrariness.** After *E. P. Royappa* (1974) and *Maneka Gandhi* (1978), arbitrariness itself violates Article 14 — "equality is antithetic to arbitrariness". The test shifted from mere classification to substantive reasonableness.
:::

## Articles 15 & 16 — Prohibition of Discrimination

Article 15 forbids discrimination on grounds *only* of religion, race, caste, sex or place of birth. Its enabling clauses permit protective discrimination:

- **15(3)** — special provisions for women and children.
- **15(4)** — advancement of socially and educationally backward classes (added by the 1st Amendment, 1951, after *Champakam Dorairajan*).
- **15(5)** — reservations in educational institutions, including private unaided ones (93rd Amendment, 2005).
- **15(6)** — up to 10% for the economically weaker sections (103rd Amendment, 2019).

Article 16 guarantees equality of opportunity in public employment, with reservation for backward classes under 16(4). The **50% ceiling** on reservations was laid down in *Indra Sawhney v. Union of India* (1992), which also excluded the "creamy layer".

## Articles 17 & 18 — Untouchability and Titles

- **Article 17** abolishes untouchability; it is enforceable against private individuals, and the Untouchability (Offences) Act 1955 (now the Protection of Civil Rights Act) gives it teeth.
- **Article 18** abolishes titles except military and academic distinctions; national awards like Bharat Ratna are not "titles" (*Balaji Raghavan*, 1996).

::: tip
Memory hook for equality — **14 general, 15 discrimination, 16 jobs, 17 untouchability, 18 titles**. Recite the enabling clause with each protective provision.
:::

\\pagebreak

# The Right to Freedom (Articles 19–22)

## Article 19 — The Six Freedoms

Available to citizens only, each subject to *reasonable restrictions*:

| Freedom | Clause | Principal restriction grounds |
|---|---|---|
| Speech & expression | 19(1)(a) | Security, public order, decency, defamation |
| Assembly (peaceful) | 19(1)(b) | Sovereignty, public order |
| Association | 19(1)(c) | Sovereignty, morality, public order |
| Movement | 19(1)(d) | General public, protection of tribes |
| Residence | 19(1)(e) | General public, protection of tribes |
| Profession / trade | 19(1)(g) | Professional / technical qualifications |

Freedom of the press is not separately named — it is read into 19(1)(a) (*Romesh Thappar*, 1950). The **right to know** and the right to fly the national flag are also derived from it.

## Articles 20 & 21 — Protection and Life

Article 20 grants protection in respect of conviction: no *ex post facto* law, no *double jeopardy*, no *self-incrimination*. Article 21 is the heart of Part III.

::: example
In *Maneka Gandhi v. Union of India* (1978), a passport was impounded "in the public interest" without a hearing. The Court struck it down, holding that Articles 14, 19 and 21 are not water-tight compartments — the **golden triangle** — and that any procedure under Article 21 must be *just, fair and reasonable*.
:::

### Rights Read into Article 21

The Court has derived an expanding family of unenumerated rights:

- Right to livelihood — *Olga Tellis* (1985)
- Right to a clean environment — the *M. C. Mehta* line of cases
- Right to privacy — *K. S. Puttaswamy* (2017), a 9-judge bench
  - Informational privacy
  - Decisional autonomy
  - Bodily integrity
- Right to die with dignity (passive euthanasia) — *Common Cause* (2018)
- Right to education (now Article 21A) — *Unni Krishnan* (1993)

::: warning
A classic trap: the 44th Amendment (1978) protected Articles 20 and 21 from suspension even during a National Emergency, but *ADM Jabalpur* (1976) — which had upheld their suspension — was formally overruled only in *Puttaswamy* (2017), four decades later.
:::

## Article 22 — Preventive Detention

Article 22 provides safeguards against arbitrary arrest (grounds of arrest, counsel, production before a magistrate within 24 hours) — but these do **not** apply to enemy aliens or to preventive detention. A detention beyond three months requires an Advisory Board.

\\pagebreak

# Religion, Culture and Remedies (Articles 23–32)

## Rights Against Exploitation (Articles 23–24)

- **Article 23** prohibits human trafficking, *begar* and forced labour; paying less than the minimum wage amounts to forced labour (*PUDR v. Union of India*, 1982).
- **Article 24** bars employment of children below 14 in factories, mines or hazardous work.

## Freedom of Religion (Articles 25–28)

Article 25 guarantees freedom of conscience and the right to profess, practise and propagate religion, subject to public order, morality and health. The **essential religious practices** doctrine lets courts decide what the Constitution protects.

| Article | Guarantee |
|---|---|
| 25 | Individual freedom of conscience & religion |
| 26 | Freedom to manage religious affairs |
| 27 | No tax for promotion of a religion |
| 28 | No religious instruction in wholly state-funded schools |

## Cultural & Educational Rights (Articles 29–30)

Article 29 protects the language, script and culture of any section of citizens. Article 30 gives religious and linguistic **minorities** the right to establish and administer educational institutions of their choice — a right the Court has guarded closely (*T. M. A. Pai Foundation*, 2002).

## Article 32 — The Right to Constitutional Remedies

Dr. Ambedkar called Article 32 "the very soul of the Constitution and the very heart of it." It empowers the Supreme Court to issue five writs:

1. *Habeas corpus* — "produce the body"; against unlawful detention.
2. *Mandamus* — "we command"; to compel a public duty.
3. *Prohibition* — stops a lower court exceeding its jurisdiction.
4. *Certiorari* — quashes an order already passed without jurisdiction.
5. *Quo warranto* — "by what authority" one holds a public office.

::: note
High Courts enjoy a **wider** writ power under Article 226 — they may issue writs both for fundamental rights *and* "for any other purpose", i.e. ordinary legal rights.
:::

::: summary
Part III binds the "State" (Art 12); Article 14 now outlaws arbitrariness; Article 21 requires fair procedure and hosts a family of derived rights; religious and minority freedoms are balanced against public order; and Article 32 makes the whole chapter enforceable. Articles 20–21 survive even a National Emergency.
:::

## A Note on Notation

Scientific and mathematical notation renders correctly — H~2~O, CO~2~, area = πr^2^ — and ~~struck-through text~~ marks deletions during revision. Use these sparingly in polity notes, but they matter for science subjects built on the same studio.

[^austin]: Granville Austin, *The Indian Constitution: Cornerstone of a Nation* (1966), ch. 3. The phrase captures the moral centrality the framers gave to Part III.
`;

/* ── 2 · Quick revision ────────────────────────────────────────────── */

const REVISION_BODY = `# Preamble — The Identity Card of the Constitution

**One-line thesis:** the Preamble declares the *source* (We, the People), the *nature* (sovereign socialist secular democratic republic) and the *objectives* (justice, liberty, equality, fraternity) of the Indian state.

## Keywords & Insertions

- **Sovereign** — no external authority; India can cede territory (*Berubari*, 1960)
- **Socialist / Secular / Integrity** — inserted by the ==42nd Amendment (1976)==
- **Democratic** — government derives authority from the people's will
- **Republic** — elected head of state; no hereditary office
- **Fraternity** — assures *dignity of the individual* and *unity and integrity of the Nation*

## Is the Preamble Part of the Constitution?

| Case | Year | Holding |
|---|---|---|
| Berubari Union | 1960 | Not a part; only a key to the makers' mind |
| Kesavananda Bharati | 1973 | **Part of the Constitution**; amendable, basic features untouchable |
| LIC of India | 1995 | Reaffirmed: integral part, not directly enforceable |

::: exam
Frequently asked (June 2023, Dec 2024): the *exact amendment* that inserted each word, and the *case* that settled the Preamble's status. Do not confuse *Berubari* with *Kesavananda*.
:::

# Basic Structure — Rapid Fire

1. Judicial invention: **Kesavananda Bharati (1973)**, 7:6 majority, 13-judge bench.
2. Trigger: the 24th–29th Amendments and the property-rights battles after *Golak Nath* (1967).
3. Article 368 grants amending power, ++not a constituent power to destroy the Constitution's identity++.
4. Applied to strike down: the 39th Amendment clause (*Indira Nehru Gandhi v. Raj Narain*, 1975) and the NJAC (2015).

## Recognised Basic Features

- Supremacy of the Constitution
- Republican & democratic form of government
- Secular character of the Constitution
- Separation of powers
- Federal character
- Judicial review — *Minerva Mills* (1980) added the ==balance between Part III and Part IV==
- Free and fair elections; rule of law; independence of the judiciary

::: tip
Answer formula for basic-structure questions: *doctrine → the case that gave it birth → two cases that applied it → one line of criticism* (the counter-majoritarian difficulty).
:::

# Amendment of the Constitution (Article 368)

## Three Routes

| Route | Majority needed | Examples |
|---|---|---|
| Simple majority | Ordinary law-making | New states, citizenship, salaries |
| Special majority | 2/3 present & voting + majority of total membership | Fundamental Rights, DPSP |
| Special + state ratification | Above + half the state legislatures | Federal provisions, election of President |

::: important
Amendments to the *federal* scheme — the distribution of powers, representation of states, the election of the President — need ratification by **at least half** the state legislatures before presidential assent.
:::

# Directive Principles (Part IV)

Non-justiciable but "fundamental in the governance of the country" (Article 37). Classified into three strands:

- **Socialist** — 38, 39, 39A, 41, 42, 43, 43A, 47
- **Gandhian** — 40 (panchayats), 43 (cottage industries), 46, 47, 48
- **Liberal–Intellectual** — 44 (uniform civil code), 45, 48, 48A, 49, 50, 51

::: note
Article 45 originally promised free and compulsory education for children up to 14. The 86th Amendment (2002) made it a fundamental right (Article 21A) and reworded Article 45 to cover early-childhood care below six.
:::

# Fundamental Duties (Part IVA, Article 51A)

- Added by the **42nd Amendment (1976)** on the Swaran Singh Committee's recommendation.
- Originally **ten** duties; an eleventh (education of one's child, ages 6–14) was added by the 86th Amendment (2002).
- Non-justiciable, but the Court may read them to interpret the reasonableness of restrictions.

# The Union Executive

## The President (Articles 52–62)

- Elected **indirectly** by an electoral college of elected MPs and elected MLAs (including Delhi and Puducherry) through the system of **proportional representation by single transferable vote**.
- Term of **five years**; eligible for re-election any number of times.
- Removable only by **impeachment** (Article 61) for "violation of the Constitution" — a quasi-judicial process requiring a 2/3 majority in each House.

::: important
The President acts on the **aid and advice** of the Council of Ministers (Article 74). The 42nd Amendment made this advice binding; the 44th Amendment allowed the President to return it **once** for reconsideration, after which it is binding.
:::

## Types of Veto

| Veto | Effect |
|---|---|
| Absolute | Withholds assent entirely (used for private members' bills, or on ministerial advice) |
| Suspensive | Returns the bill; can be overridden by a fresh passage |
| Pocket | Takes no action — no time limit is prescribed |

India has **no qualified veto**. The President has no veto over a Constitutional Amendment Bill (24th Amendment made assent mandatory).

# Parliament (Articles 79–122)

- **Lok Sabha** — max strength 552; directly elected; five-year term; the government is responsible to it.
- **Rajya Sabha** — max strength 250; a permanent body, one-third retiring every two years; represents the states.

::: tip
Remember the money-bill asymmetry: a **Money Bill** (Article 110) can be introduced only in the Lok Sabha and the Rajya Sabha can only *recommend* changes within 14 days. The Speaker's certificate on what is a Money Bill is final.
:::

# The Judiciary

- **Supreme Court** (Articles 124–147): original, appellate, advisory and review jurisdictions; guardian of the Constitution.
- **Collegium system** governs appointments after the *Second* and *Third Judges* cases; the NJAC (99th Amendment) was struck down in 2015.
- **Judicial Review** lets courts test the constitutionality of legislative and executive action against Part III and the federal scheme.

# Federalism — Quasi-Federal Design

India is an "indestructible Union of destructible states" — federal in structure with a strong unitary tilt. Powers are divided by the **Seventh Schedule** into three lists:

| List | Subjects | Who legislates |
|---|---|---|
| Union | 100 subjects (defence, foreign affairs) | Parliament |
| State | 61 subjects (police, public health) | State legislatures |
| Concurrent | 52 subjects (education, forests) | Both; Union prevails on conflict (Art 254) |

Residuary powers rest with the **Union** (Article 248), unlike the American model.

# Constitutional Timeline — Key Milestones

| Year | Milestone |
|---|---|
| 1946 | Cabinet Mission Plan; Constituent Assembly convened |
| 1949 | Constitution adopted (26 November) |
| 1950 | Constitution comes into force (26 January) |
| 1951 | 1st Amendment — reasonable restrictions, 9th Schedule |
| 1973 | *Kesavananda Bharati* — basic-structure doctrine |
| 1976 | 42nd Amendment — the "mini-Constitution" |
| 1978 | 44th Amendment — Right to Property demoted; Arts 20–21 shielded |
| 1992 | 73rd & 74th Amendments — panchayats and municipalities |
| 2017 | *Puttaswamy* — privacy a fundamental right |
| 2019 | 103rd Amendment — 10% EWS reservation |

# Self-Check Before the Exam

- [ ] Can I name the four objectives of the Preamble in order?
- [ ] Which words entered the Preamble in 1976?
- [ ] What was the majority ratio in *Kesavananda*?
- [ ] Two laws struck down on basic-structure grounds?
- [ ] The three routes of amendment under Article 368?
- [ ] The three classes of Directive Principles?
`;

/* ── 3 · MCQ booklet ───────────────────────────────────────────────── */

const MCQ_BODY = `Attempt all questions. Each carries 2 marks; there is no negative marking. Sources are actual previous-year papers. Mark the single best option.

## Section A — Constitutional Development

Q. The Cabinet Mission Plan (1946) proposed —
A) A federation with a three-tier grouping of provinces *
B) Immediate partition into two dominions
C) Direct elections to the Constituent Assembly
D) A unitary state with devolved provinces
Explanation: The Mission rejected partition and proposed a three-tier structure — Union, groups of provinces, and provinces — with the Constituent Assembly elected indirectly by the provincial assemblies.
Topic: Constitutional Development
Source: UGC-NET Dec 2023

Q. Who moved the Objectives Resolution in the Constituent Assembly?
A) B. R. Ambedkar
B) Rajendra Prasad
C) Jawaharlal Nehru *
D) K. M. Munshi
Explanation: Nehru moved it on 13 December 1946; its ideals were later distilled into the Preamble.
Topic: Constituent Assembly
Source: UGC-NET June 2022

Q. The Constituent Assembly took how long to frame the Constitution?
A) 2 years, 11 months, 18 days *
B) 3 years, 6 months
C) 1 year, 11 months
D) 4 years exactly
Explanation: From 9 December 1946 to 26 November 1949 — about 2 years, 11 months and 18 days, across 11 sessions.
Topic: Constituent Assembly
Source: CUET-PG 2023

Q. Match the borrowed features with their sources and select the correct code —
A) Ireland: Directive Principles; USA: Judicial review; UK: Parliamentary system *
B) USA: Directive Principles; Ireland: Judicial review; UK: Rule of law
C) Canada: Directive Principles; USA: Cabinet system; UK: Federal list
D) Australia: Judicial review; USA: Concurrent list; UK: Fundamental duties
Explanation: DPSPs came from the Irish Constitution, judicial review from the American model, and the parliamentary executive from the British system.
Topic: Sources of the Constitution
Source: CUET-PG 2024

## Section B — Fundamental Rights & Duties

Q. "Procedure established by law" in Article 21 was given a due-process reading in —
A) A. K. Gopalan v. State of Madras
B) Maneka Gandhi v. Union of India *
C) Golak Nath v. State of Punjab
D) Shankari Prasad v. Union of India
Explanation: Maneka Gandhi (1978) held the procedure must be just, fair and reasonable, effectively importing substantive due process.
Topic: Article 21
Source: UGC-NET Dec 2024

Q. The right to privacy was declared a fundamental right in —
A) Kharak Singh v. State of UP
B) M. P. Sharma v. Satish Chandra
C) K. S. Puttaswamy v. Union of India *
D) Naz Foundation v. NCT of Delhi
Explanation: A nine-judge bench in Puttaswamy (2017) unanimously held privacy to be intrinsic to Article 21, overruling contrary observations in Kharak Singh and M. P. Sharma.
Topic: Right to Privacy
Source: UGC-NET June 2023

Q. Fundamental Duties were added on the recommendation of —
A) Sarkaria Commission
B) Swaran Singh Committee *
C) Punchhi Commission
D) Balwant Rai Mehta Committee
Explanation: The Swaran Singh Committee (1976) recommended them; the 42nd Amendment inserted Article 51A with ten duties (an eleventh came in 2002).
Topic: Fundamental Duties
Source: Rajasthan SET 2023

Q. The 50% ceiling on reservations was laid down in —
A) Indra Sawhney v. Union of India *
B) Champakam Dorairajan v. State of Madras
C) M. R. Balaji v. State of Mysore
D) Ashoka Kumar Thakur v. Union of India
Explanation: Indra Sawhney (1992) capped total reservations at 50% and introduced the "creamy layer" exclusion for OBCs.
Topic: Reservation
Source: UGC-NET Dec 2022

## Section C — Amendment & Basic Structure

Q. Arrange the following cases chronologically —
A) Golak Nath → Kesavananda → Minerva Mills → Waman Rao *
B) Kesavananda → Golak Nath → Waman Rao → Minerva Mills
C) Golak Nath → Minerva Mills → Kesavananda → Waman Rao
D) Kesavananda → Minerva Mills → Golak Nath → Waman Rao
Explanation: Golak Nath (1967), Kesavananda Bharati (1973), Minerva Mills (1980), Waman Rao (1981).
Topic: Amendment & Basic Structure
Source: UGC-NET June 2024

Q. Which amendment is described as a "mini-Constitution"?
A) 42nd Amendment *
B) 44th Amendment
C) 1st Amendment
D) 73rd Amendment
Explanation: The 42nd Amendment (1976) made sweeping changes — adding "socialist", "secular", "integrity", Fundamental Duties, and altering the DPSP–FR balance — earning the label "mini-Constitution".
Topic: Amendments
Source: CUET-PG 2024

Q. The power of judicial review flows primarily from which pair of Articles?
A) Articles 32 and 226 *
B) Articles 14 and 21
C) Articles 245 and 246
D) Articles 124 and 217
Explanation: Article 32 (Supreme Court) and Article 226 (High Courts) confer the writ jurisdiction that anchors judicial review; Article 13 makes laws violating Part III void.
Topic: Judicial Review
Source: Rajasthan SET 2024

Q. Which of the following is NOT recognised as a basic feature of the Constitution?
A) Sovereignty of Parliament *
B) Judicial review
C) Federal character
D) Secularism
Explanation: Parliamentary sovereignty is precisely what the basic-structure doctrine denies — the Constitution, not Parliament, is supreme in India.
Topic: Basic Structure
Source: UGC-NET June 2024
`;

/* ── 4 · Flash cards ───────────────────────────────────────────────── */

const FLASHCARDS_BODY = `# Articles, Doctrines & Landmarks

Thirty high-yield prompts across rights, structure and institutions. Cover the answer, recall aloud, then flip.

## Article 12 defines —

**"State"** for Part III — government and legislatures of the Union and states, local bodies, and *other authorities* under government control.

## Article 13 provides —

**Judicial review** — laws inconsistent with Part III are void, covering both pre- and post-constitutional laws.

## Writ of *Habeas Corpus* means —

**"Produce the body"** — issued against unlawful detention; available against both the state and private persons.

## Writ of *Mandamus* means —

**"We command"** — compels a public authority to perform a mandatory public duty it has failed to do.

## Writ of *Quo Warranto* means —

**"By what authority?"** — challenges a person's right to hold a public office.

## Article 32 was called "the heart and soul of the Constitution" by —

**B. R. Ambedkar**, in the Constituent Assembly debates.

## Doctrine of *Eclipse* —

A pre-constitutional law inconsistent with Part III is **not dead, only shadowed** — it revives if the inconsistency is later removed (*Bhikaji Narain*, 1955).

## Doctrine of *Severability* —

Only the **offending portion** of a statute is void, provided it is separable from the valid part (*R.M.D.C.*, 1957).

## Doctrine of *Basic Structure* —

Parliament may amend the Constitution but **cannot destroy its essential identity** (*Kesavananda Bharati*, 1973).

## Article 14 guarantees —

**Equality before law** and **equal protection of the laws** — now also a guarantee against *arbitrariness* (*Maneka Gandhi*, 1978).

## Article 15(3) permits —

**Special provisions for women and children** — a form of protective discrimination.

## Article 16(4) permits —

**Reservation** in public employment for backward classes not adequately represented in state services.

## Article 17 abolishes —

**Untouchability** — enforceable even against private individuals.

## Article 19 freedoms are available only to —

**Citizens** (not foreigners, and not to corporations as such).

## The "Golden Triangle" of the Constitution —

**Articles 14 + 19 + 21** read together (*Maneka Gandhi*, 1978).

## Article 21A guarantees —

**Free and compulsory education** for children aged 6–14 (86th Amendment, 2002).

## Article 25 covers —

Freedom of **conscience, profession, practice and propagation** of religion, subject to public order, morality and health.

## Article 26 covers —

The right of every religious denomination to **manage its own religious affairs**.

## Minority educational rights flow from —

**Article 30** — the right to establish and administer educational institutions of choice.

## Right to property today is —

A **constitutional right under Article 300A** (44th Amendment, 1978) — no longer a fundamental right.

## *Puttaswamy* (2017) held —

**Privacy is a fundamental right** intrinsic to Article 21 — a 9-judge unanimous bench.

## *Indra Sawhney* (1992) held —

Reservations are capped at **50%**, and the **"creamy layer"** among OBCs must be excluded.

## The Preamble was amended —

**Once**, by the **42nd Amendment (1976)**, adding *socialist*, *secular* and *integrity*.

## Directive Principles are found in —

**Part IV (Articles 36–51)** — non-justiciable but fundamental to governance (Article 37).

## Fundamental Duties are found in —

**Part IVA, Article 51A** — added by the 42nd Amendment; now eleven in number.

## The three routes of amendment (Article 368) —

**Simple majority**, **special majority**, and **special majority + ratification by half the states**.

## *Minerva Mills* (1980) established —

The **balance between Fundamental Rights and Directive Principles** is itself part of the basic structure.

## Article 40 directs the state to —

Organise **village panchayats** as units of self-government (a Gandhian principle).

## Article 44 directs the state to —

Secure a **Uniform Civil Code** throughout the territory of India.

## Article 50 directs the state to —

**Separate the judiciary from the executive** in the public services of the state.

## National Emergency (Article 352) suspends —

Most Part III rights, **except Articles 20 and 21** (protected by the 44th Amendment, 1978).

## President's Rule flows from —

**Article 356** — imposed on the failure of constitutional machinery in a state; needs parliamentary approval within two months.

## Financial Emergency is declared under —

**Article 360** — never yet invoked in India's history.

## The President is elected by —

An **electoral college** of elected MPs and elected MLAs, via proportional representation and the single transferable vote.

## A Money Bill can be introduced only in —

The **Lok Sabha**, and only on the President's recommendation (Article 110).

## Residuary powers rest with —

The **Union Parliament** (Article 248) — unlike the United States, where they rest with the states.

## The Collegium system governs —

The **appointment of judges** to the Supreme Court and High Courts, evolved through the Judges' cases.

## The 73rd and 74th Amendments (1992) created —

Constitutional status for **Panchayati Raj institutions** and **urban local bodies**.

## The Speaker of the Lok Sabha is —

Elected **by the House** from among its members; decides whether a bill is a Money Bill.

## The Seventh Schedule contains —

The **Union, State and Concurrent Lists** dividing legislative power between the Centre and states.

## The Anti-Defection Law is in the —

**Tenth Schedule**, added by the 52nd Amendment (1985).
`;

export const DEMOS: DemoDoc[] = [
  {
    id: "demo-notes",
    template: "notes",
    title: "Fundamental Rights — Complete Notes",
    subtitle: "Articles 12–35 with doctrines, landmark cases and exam angles",
    paper: "Paper 2 · Indian Government & Politics",
    description: "Long-form theory notes across 12 pages: chapters, comparative tables, every callout type, footnotes and highlights.",
    body: NOTES_BODY,
  },
  {
    id: "demo-revision",
    template: "revision",
    title: "Polity Rapid Revision — Structure & Principles",
    subtitle: "Preamble, Basic Structure, Amendments, DPSP & Duties in one sitting",
    paper: "Paper 2 · Units 1–3",
    description: "Compact revision sheet: rapid-fire bullets, attribution tables, route comparisons and exam callouts.",
    body: REVISION_BODY,
  },
  {
    id: "demo-mcq",
    template: "mcq",
    title: "Indian Constitution — PYQ Drill",
    subtitle: "Previous-year questions with answer key and detailed explanations",
    paper: "Practice Set 01 · 12 Questions",
    description: "MCQ booklet: three sections, topic / source chips, answer key and full explanations.",
    body: MCQ_BODY,
  },
  {
    id: "demo-flashcards",
    template: "flashcards",
    title: "Constitutional Articles — Flash Cards",
    subtitle: "Thirty active-recall prompts on rights, doctrines and landmarks",
    paper: "Core Deck · 30 Cards",
    description: "Cut-out flash cards: article numbers, doctrines, writs and one-line holdings for spaced repetition.",
    body: FLASHCARDS_BODY,
  },
];
