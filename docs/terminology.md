# Terminology: words CIRKS uses strictly

**Source material for the user manual.** Opened 2026-09-21. Each entry is a word
that users will bring from somewhere else with a different meaning, and that
causes real mistakes if it is not pinned down. Add an entry whenever a
conversation has to stop and ask "what do you mean by that?".

---

## Control objective, control, standard requirement

**Highlight this in the user manual.** Agreed with the owner on 2026-09-21, after a
long conversation in which the same two words meant different things to each
side. Three things need three words:

| Word | What it is | Where it lives | Example |
|---|---|---|---|
| **Control objective** | A job to be done. The library holds the ideal set; nothing in it is done until adopted. | Control Library (the CIRKS control objectives ship as the set; add your own) | "Administrative access requires multi-factor authentication" |
| **Control** | How the organisation does that job: the components that together meet the objective. It is modelled, rated, and deployed on systems. | Built once the objective is adopted | Identity provider + hardware tokens + the joiner process that issues them |
| **Standard requirement** | A standard's own text, in its own numbering. Only exists for organisations that report against a standard. | Setup → Control Sets, mapped onto control objectives | PCI 8.4, ISO A.8.5, NIST PR.AA-03 |

**The flow in one sentence:** the library holds control objectives; ticking
*applicable* in the Statement of Applicability adopts one; the organisation then
builds and rates the control that meets it; and if it reports against a
standard, that standard's requirements are mapped onto its objectives.

**Most customers use no standard at all.** For them the third word never
appears: the library is simply their catalogue of objectives, and the SoA is
their statement of which they have adopted and why.

**One objective can meet requirements in several standards, and one requirement
can need several objectives.** The links are **mappings**, marked full or
partial. So an objective does not "belong" to a standard, even when it was
loaded from one.

### The trap: every standard has its own word for a requirement

| Standard | Calls its requirements | CIRKS calls them |
|---|---|---|
| ISO/IEC 27001 | **Annex A controls** | standard requirements |
| NIST CSF 2.0 | subcategories (outcomes) | standard requirements |
| CIS Controls v8 | safeguards | standard requirements |
| PCI-DSS | requirements | standard requirements |

ISO is the dangerous one. An ISO auditor will say "control A.8.5" and mean a
**standard requirement**: a line in Annex A. In CIRKS that line is met by one or
more control objectives, each with its own control. The manual should say so
plainly, so that a user reading "Annex A control" in an audit report does not go
looking for it in the Control Library.

Two further sources of confusion the manual should anticipate:

- **A standard is not the library.** Until v1.1 CIRKS shipped NIST CSF 2.0 with
  each of its 106 subcategories also loaded as a control objective of the same
  wording, so the objective and the requirement looked identical, and NIST's
  outcome statements became what people managed. Since v1.1 CIRKS ships its own
  control objectives (158, written for the job, e.g. *Restores are tested*), and
  NIST CSF, ISO 27001 and CIS Controls are reporting sets mapped onto them. A
  requirement is met only when every objective mapped to it is in place.
- **Loading a standard is not adopting it.** A standard can be loaded purely as a
  source of good objectives, with no intention of meeting all of it. Only a
  standard adopted as an obligation should produce gaps
  (`statement-of-applicability.md` §4.3; not
  yet built).

### An objective's status

Derived, never stored (v124), from whether it is adopted in the SoA and whether
its maturity has been rated:

| Status | Means |
|---|---|
| **Not decided** | nobody has yet decided in the SoA whether it applies |
| **Not applicable** | judged not applicable in the SoA |
| **Not assessed** | adopted; maturity not yet rated |
| **Adopted** | adopted, and maturity rated |

There is no "ineffective" status: an ineffective control shows up as a low
maturity rating, or as a degraded deployment on a particular system.

### Scope

A **scope** is a named set of systems in which an objective applies — for
example the cardholder data environment for PCI-DSS. By default an adopted
objective applies to the **whole organisation** (every active system); narrowing
it to one or more scopes makes those scopes' systems the ones it is expected on.
Drawing a scope is a governance statement and needs `scopes.manage` (CISO, SIRO,
admin). Security Controls → Scopes.

### How a control is delivered (v127)

Every control has exactly **one** delivery mode — never a mixture:

- **Organisation-wide** — delivered once for everyone (a policy; awareness training
  for all staff). Covers every system where the objective applies.
- **For a group** — delivered to a group of people, modelled as a *people*
  component (secure-coding training for developers). Covers the systems that group
  works on.
- **On each system** — deployed and checked system by system (MFA, endpoint
  protection).

A baseline for everyone plus extra for a group is **two objectives**, as the NIST
CSF does with PR.AT-01 and PR.AT-02. See `statement-of-applicability.md` §4.8.

### Where the words appear in CIRKS

- **Control Library**: control objectives.
- **Setup → Objectives & standards** (formerly *Control Sets*): step 1 imports *control objectives*, step 2 a
  standard's *requirements*, step 3 the *mappings* between them.
- **Statement of Applicability**: a read-only **register** — the statement an
  auditor reads. The *All control objectives* view lists every objective with its
  decision, justification, implementation and maturity; choosing a standard shows
  its *requirements*, each derived from the objectives mapped to it. Its one
  editing act is deciding several objectives at once (first-time triage).
- **The objective's own page**: where one objective is decided (*Decision*) and
  its control is built, implemented and rated (*Our control* → *Edit control*).

### Not yet consistent (known)

- **One row, two faces.** In the database, one row in `controls` holds both the
  objective and the control that meets it. The pages keep them apart (2026-09-22):
  the objective page answers *what it asks* and *how well it is met* for anyone,
  and shows **Our control** — components, relationships, threat links, graph —
  only once the objective is adopted, read-only until a `controls.write` holder
  chooses **Edit control**. Maturity is rated in the Statement of Applicability,
  beside the implementation status.
- The tables keep their old names: `controls` (objectives and their controls)
  and `standard_controls` (standard requirements). They are internal; renaming
  them was judged not worth the churn on 2026-09-21.

---

## Information asset / policies & documents

*Agreed 2026-09-29.* PPITF's **I** had come to mean two different things, and the
word "information" was hiding the difference.

- An **information asset** is business information the organisation holds and
  must protect — *Fisheries data*, *Patient medical records*. It is owned by an
  IAO, rated against impact tables, and its rating drives every impact and risk
  score. For a **system**, the "I" is its information assets. Business
  Architecture → *Information Assets*.
- **Policies & documents** are the documented information the ISMS runs on —
  policies, standards and procedures (ISO 27001 clause 7.5). They **deliver
  control objectives**: the Acceptable Use Policy supports GV.RR-02 and GV.RR-04.
  They are components of type `information` in the catalogue, shown as
  *Policies & documents*. Security Controls → *Policies & documents*.

A **guideline** is advisory; nobody is bound by it, so it does not deliver a
control (owner's ruling, 2026-09-29). Only policies, standards and procedures
count.

Most documents exist **once for the organisation** (§5) — but not all: a system
security plan exists per system. So the question is asked, never assumed from the
type.

**A document's state** is shown in its owners' words (owner, 2026-09-29), stored
as the same component state every component has, so coverage and findings treat
it alike: **Published** (operational — in force), **Under review** (degraded — in
force, not confirmed current), **Not published** (planned — not in force; reads
as missing). *Unknown* means nobody has said.


## Implied (not "wanted") / called for / recorded / delivered

*Agreed 2026-10-07.* The design notes and the database call an objective the
security architecture expects on a system **wanted** (`v_system_wanted_objectives`).
On screen that word hid the cause — wanted by whom? — so it is not used there.

- A control objective is **implied** on a system when a component recorded on
  the system triggers a security solution, and that solution delivers the
  objective. The system's own record implies it; nobody has to ask for it. Say
  what implies it wherever there is one cause to name: *implied by CrowdStrike
  EDR*. Where there is not, *implied by this system's security solutions* or
  *implied by the security architecture*.
- It is **called for** by a threat when a threat identified on the system is
  countered by it: *called for by Ransomware*.
- It is **recorded** when it has a row on the system's Control objectives tab,
  with a state. An objective can be implied and not recorded.
- It is **delivered** when a security solution that delivers it is settled for
  the system — chosen by a person, or counted as chosen because it is complete in
  place (v150). An objective can be implied and still need a solution chosen.

*Implies*, not *infers*: a fact implies; a reader infers. Internal names keep
"wanted" (the views, `docs/system-security-view.md`); they are not shown to users.

## Security solution pattern, standard build, system profile (owner, 2026-11-09)

Three things that were all called "pattern" or "template". The internal names
(`system_builds`, the `/architecture/builds` routes, the `/architecture-patterns`
path) are unchanged. The system profile was retired in v178: the membership
groups, their routes and the `/architecture-template` page went, replaced by the
system patterns and component roles.

| Word | What it is | Generic or the organisation's | Example |
|---|---|---|---|
| **Security solution pattern** | A reusable shape of security solution: its slots (the kinds of part it needs, each in a role) and what makes it complete (`docs/meta-architecture.md` §11, P1–P8; built in v176, `/security-solution-patterns`). A security solution says which one it implements. | Generic | *Governing document*, *Central security service*, *Configured setting* |
| **System pattern** | One of the eight shapes a business system takes, each with its own questions (slots): an application on premises, on cloud infrastructure (IaaS) or on a cloud platform (PaaS), software as a service (SaaS), dedicated equipment and operational technology, end-user device, network infrastructure, document record (v177, `/system-patterns`, `docs/system-patterns.md`). A system says which it follows; it must answer only the slots its pattern requires (v178: required only where something reads the answer). | Generic | *Supplier-run service*, *Dedicated equipment* |
| **Role (of a component)** | A question of a system pattern a component can answer on any system that records it: Windows 11 can answer *Operating system*; IT Administrators *Support team* and *Who uses it* (v178). Replaced the system profile's membership groups. | Generic | *can answer: Where it runs* |
| **Standard build** | The organisation's own way of building a kind of system, repeated on every system built to it. Applying it copies its components onto a system. Was *system architecture pattern*. | The organisation's | MIG Desktop, MIG CCTV |
| ~~**System profile**~~ | Retired in v178. Was the questions every system's record must answer, one membership group per question; the questions are now the system pattern's slots, and what answers each is a role on the component. | — | — |

Say *a system built to the MIG Desktop standard build*, and *a component that can
answer Where it runs*. Do not call a standard build a pattern: that word is kept for
the generic security solution patterns.

---

## Exception / accept / acceptance (owner, 2026-11-16)

Three acts that users run together:

| Word | What it is | Where |
|---|---|---|
| **Exception** | The formal, time-limited record that a risk (or an assurance finding) is accepted: its justification, who accepted it and in what role, the review cadence and the expiry. It can be renewed or revoked, and it lapses when it expires. | Security Exceptions register; a risk's *Who decided what?*; a finding's banner |
| **Accept** (the treatment) | One of the four treatments (avoid, mitigate, transfer, accept). Deciding to accept is not enough: until an exception is recorded, nobody has accepted the risk. | Treatment decision on the risk |
| **Acceptance** of a security action | The CISO (or the SIRO at the Security Working Group) agreeing a proposed security action, which freezes its items and snapshots the risk. | Acceptance Queue; *awaiting acceptance* |

So on screen: *Exceptions in force*, *no security action and no exception*,
*Decided to accept, with no exception recorded*, but *Action awaiting
acceptance*. Never "acceptance" for the record. Internal names
(`exceptions`, `acceptances` fields in report payloads) are not renamed.

