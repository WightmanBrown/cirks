# CIRKS Modelling Patterns

Guidance for analysts on how to represent real-world risk scenarios in CIRKS's
data model (systems, information assets, threats, controls, PPITF components).
Each pattern states the scenario, the tempting-but-wrong approach, the
recommended modelling, and why it works. Add a new pattern whenever a scenario
takes more than one attempt to model cleanly.

CIRKS basics these patterns assume:

- A **risk** is anchored to a **system** + a **threat** (one `(system, threat)`
  pair per active risk).
- A **system** is a PPITF aggregate (People / Process / Information /
  Technology / Facility) plus its linked **information assets**.
- A system's **impact** (C/I/A) is derived as the `MAX` over the information
  assets linked to it — so a system with no information assets scores near-zero
  impact regardless of how important it really is.
- **Treatment** is applied per risk via security actions and controls.

---

## Pattern: Shadow IT / rogue-asset risk

**Scenario.** A department, frustrated with central IT, buys its own hardware
(the canonical case: a department buys Chromebooks and plugs them into the
corporate network) and starts doing real work on it — outside patching, EDR,
MDM, monitoring and asset management. The "thing causing the risk" is a piece of
unmanaged technology that now touches shared infrastructure.

**The tempting (wrong) approach.** Treat it as a *network* risk and enumerate
the victims — "unauthorised hardware threatens the network, and Active
Directory, and email, and …". This fails three ways:

1. It **fragments one root cause into many risks**. The single fix (remove or
   govern the devices) now has to be tracked across N risk records, and you can
   never tell when you're "done".
2. It **double-counts**. AD and email are *downstream consequences* of the same
   compromise, not independent risks.
3. The **blast radius is effectively incalculable** — too many vectors and
   reachable systems to enumerate honestly.

**The pattern.** Model the rogue asset itself as a **system**.

- Create a system for the rogue fleet (e.g. "Unauthorised Chromebook Fleet —
  Dept X"). It is a legitimate PPITF aggregate (the hardware is a `technology`
  component; the department's people and processes attach too).
- Link the **information asset** that actually lives on it — *the department's
  data, now on unmanaged devices*. This is what CIRKS scores impact from, and
  it's the real, **bounded** exposure.
- Anchor the risk to that system with a threat describing the control gap —
  e.g. **"inadequate security tooling coverage"** (or "compromise via unmanaged
  endpoint").
- Treatment is a single action: **govern-or-remove** (bring under MDM/EDR/patch
  management, or remove from the network).
- When the department is brought back into governance, retire the system
  (`is_active = false`). The risk closes with it.

**Why it works.**

- It **relocates the risk to the offending asset** instead of spraying it across
  victims — so it stays a single, trackable, closable record.
- The "a system must have an information asset to score impact" constraint
  becomes a *feature*: it forces you to name the real, bounded impact (sensitive
  data on unmanaged devices) instead of an unbounded network blast radius. CIRKS
  can score that through its normal impact chain.
- The rogue asset becomes **first-class in the inventory** with a proper
  lifecycle: surface → rate → treat → retire — exactly what you want for
  shadow IT.

**The facet you are deliberately *not* scoring.** This single risk captures
*data-on-device* (bounded). It does **not** separately quantify
*device-as-pivot-into-the-network* (the blast radius). That is legitimate
because **the treatment is singular** — removing or governing the devices closes
*both* facets at once. When one control resolves every facet of a risk, anchor
the risk to the root cause and score it by the most material *bounded* impact;
don't try to enumerate the unbounded one.

**Taxonomy note.** "Inadequate security tooling coverage" is strictly a
*vulnerability / control gap* rather than a *threat* (the threat proper is
"compromise via an unmanaged endpoint"). Framing it as the threat is acceptable
here because it points straight at the treatment — just be aware that's what it
is.

**Generalises to:** any shadow-IT / rogue-asset situation — unsanctioned SaaS,
an unmanaged server under someone's desk, a personal NAS on the LAN. Model the
rogue thing as a **system**, its data as the **information asset**, the control
gap as the **threat**, and **govern-or-remove** as the treatment.

> Related open model question (not required for this pattern): CIRKS derives a
> system's impact from the information assets it *contains*, which under-rates
> *supporting* assets (network, AD, DNS) whose importance comes from what
> *depends on* them. The shadow-IT pattern sidesteps this by scoring the data on
> the device rather than the infrastructure it can reach. See the risk-model
> backlog if/when "criticality by dependents" is taken on.
>
> **Partly answered since** by *Pattern: Infrastructure systems* below — giving a
> supporting system its own information asset, rated for what losing it would
> mean, states its importance directly without needing a dependents mechanism.
> The general case (deriving criticality from what depends on a system) remains
> open.

---

## Pattern: Infrastructure systems (networks, identity, shared platforms)

*Decided 2026-08-19 against the Misty Isles dataset. **Needed in the user
manual** — every organisation hits this within a day of starting, and getting it
wrong stays invisible until the roll-up stops making sense. No code change is
required to follow it.*

**Scenario.** A core network (MIGNet), an identity service, or any shared
platform that most of the organisation touches. The question is what to attach
to it, because in a sense *everything* crosses it.

**The tempting (wrong) approach.** Attach every information asset that traverses
it. In the Misty Isles dataset MIGNet carried **17 assets from 9 departments**.
This fails on accountability: not one of those nine departments can do anything
about a MIGNet outage. The network department fixes it whether one asset is
attached or seventeen. Meanwhile the attachments put the system in nine
departments' "Systems in my remit", and give nine services a stake nobody can
act on.

**The equally wrong opposite.** Attach nothing, on the grounds that endpoint
encryption means the network is not really exposed. A system with no information
assets has NULL impact, and the risk trigger floors impact to 1 — so every risk
on it collapses to a trivial score. A denial-of-service risk that should read 15
reads 3. The availability exposure that makes a network worth modelling at all
is precisely the one that would vanish.

**The pattern.** An infrastructure system holds **the asset that *is* its
function**, owned by the department that operates it. Nothing else attaches.

- Network → *Internal Network Traffic*, owned by the network department.
- Identity service → *Authentication data*, owned by the identity team.

**Why it works.**

- **Impact is unchanged**, which is what makes it safe. Impact is a `MAX` over
  linked assets, so one asset rated 5/5/5 gives exactly the same system impact as
  seventeen whose highest is 5/5/5. Every risk score on the system is identical
  before and after. Only *ownership* changes.
- **The risk lands on the desk that can act on it.** That is the whole point:
  responsibility for fixing a shared system sits with its operator regardless of
  how many departments' data crosses it.
- **It answers this document's own open question** (see the note closing the
  shadow-IT pattern): supporting infrastructure was under-rated because impact
  derives from what a system *contains*. Giving the network its own asset, rated
  for what losing it would mean, states its importance directly instead of
  waiting for a "criticality by dependents" mechanism.

**Where the rule stops.** The test is not "is this infrastructure?" but:

> **If this system were breached, whose data is exposed?**
> versus
> **If this system stopped, whose service stops?**

A network answers "nobody's" to the first and "everyone's" to the second, so it
holds traffic only. **A backup system is the opposite and the rule must not be
applied to it** — MIG Backup holds 12 assets across 7 departments and that is
*correct*, because it genuinely retains their information at rest. Breach it and
their data really is exposed. An asset called "Backup copies" would be a fiction
concealing a real confidentiality exposure.

The distinction is **transit and means** versus **retention**:

| System | Carries | Retains | Attach |
|---|---|---|---|
| Network | ✔ | ✘ | its own traffic asset |
| Identity service | ✔ | ✘ (credentials only) | its own authentication asset |
| Backup / archive | ✔ | ✔ | every asset it holds copies of |
| Email | ✔ | ✔ | the assets that live in mailboxes |

Email is the honest middle case: it both carries and retains, so its real
attachments are right.

**Do not model endpoint controls as network controls.** A tempting move is to
say "the network has no confidentiality exposure because we use TLS" and record
TLS as a control on the network system. **TLS terminates at the endpoints.** It
is a control on the host services, and attaching it to the network claims
protection at a layer that does not provide it. The reason a network carries
little confidentiality exposure is that it *holds* little — which this pattern
already expresses through what is attached. State it in the inventory, not as a
control that is not there.

**The cost, which must be accepted deliberately.** Detaching those assets
removes the system from every one of those departments' "Systems in my remit" —
intended, since they do not own it — but their visibility of it then flows
**solely through service → system dependency links** ("systems you would depend
on", v104). That makes those links load-bearing: a department sees a shared
system's risks only if one of its services links that system. Apply this pattern
without maintaining the dependency links and you will have quietly hidden a
critical dependency from everyone who depends on it.

**Generalises to:** any system whose importance comes from what depends on it
rather than what it stores — networks, DNS, identity, certificate authorities,
message buses, shared runtime platforms.

---

## Pattern: Security systems (CCTV, a SOC, a backup service — anything that protects other systems)

*Decided 2026-10-09 while the owner built the Bank Street and Castle CCTV on the
Misty Isles dataset. It took two attempts, and the second produced a mistake
that is easy to make and invisible when you make it — which is why it is written
down. **Needed in the user manual and in training.***

**Scenario.** Something whose whole purpose is to protect other systems: the
CCTV watching a server room (cameras, a digital video recorder, an operations
room, an operator), a monitoring service and its analysts, a backup server. A
control objective — *physical access to assets is managed, monitored and
enforced* — is met for a server in that room only if this thing is working.
Two questions follow at once: *is it a system or a security solution?* and
*where do I record that the recorder has failed?*

**The tempting (wrong) approach, first form.** Treat the whole thing as a
**security solution** — it protects things, after all — and add "the CCTV" to it
as one organisation-wide component. It works, in that the objective reads
degraded when the component is degraded. But nobody owns the CCTV, it has no
risks of its own (its footage is personal data; the recorder can fail or be
tampered with), and the operator, the recorder and the room have nowhere to be
recorded separately. A user will ask *why isn't this a system?* and there is no
good answer.

**The tempting (wrong) approach, second form — the common mistake.** Create the
component (*Server Room :: CCTV at The Castle*), leave its scope as **once per
system**, and add it to the solution. A once-per-system component can only be
placed **on the system itself**, so the solution now says *every system hosted
in The Castle must have its own copy of that CCTV*. Nothing on screen objects.
What happens next, on the Misty Isles data:

- physical access went from *degraded* to **missing** on 7 of the 9 systems in
  The Castle, because none of them records a CCTV of its own;
- 9 systems gained the finding *not recorded: Server Room :: CCTV at The Castle*,
  each asking its department to record something that is not theirs.

The tell is the finding appearing on systems you were not working on.

**The pattern.** Keep the two things apart, because they are different kinds of
thing:

- A **system** is something the organisation *runs*. A department owns it, it is
  made of components, it holds information, and things can go wrong with it.
- A **security solution** is a statement of *dependence*: for this objective to
  be met here, these components must be working, in these places. It owns
  nothing and has no state of its own; it reads the state of its parts.

So the CCTV is a **system** — a *security system* — and the solution *Secure
datacentre — The Castle* points at it. Nothing is both.

1. Create the system (*MIG CCTV system*), owned by whoever runs it.
2. Record its parts on it — cameras, recorder, operations room, operator — each
   with its state. Give each the scope **once for the organisation**: there is
   one recorder, not one per server.
3. On the security solution, add each as a part and choose **On a security
   system**, naming the CCTV system. (A component can be placed there only once
   it is recorded on that system — hence step 2 before step 3.)
4. To record a failure, change the part's state **on the CCTV system**. Every
   system relying on it follows.

**How to tell a security system from a component.** Does it have someone who
runs it, more than one part, information of its own, and ways of failing worth
assessing? The CCTV does. One door lock does not: it stays a component, added to
the solution as *once for the organisation*.

**Why it works.**

- The failure is recorded **once, where it happened**, and reaches every system
  that depends on it — the same reason a degraded organisation-wide component
  degrades everything relying on it.
- The security system gets what every system gets: an owner, an impact from the
  information it holds, threats and risks, and security solutions of its own. It
  sits on a network and runs an operating system, so the same trigger rules
  apply to it. *Who secures the security system?* needs no special answer.
- The solution stays a short, readable list of dependencies rather than a second
  place to keep state.

**Two smaller traps met on the way.**

- *A recorded component that does not answer the template.* The new system's
  **Connectivity** slot stayed blank although *MIG CCTV Network* was recorded on
  it. A template group accepts only its **members**; a new network has to be
  added to the Connectivity group (Security Controls → Systems architecture
  template) before it counts as an answer. The same went for its operating
  system.
- *A component named after the system.* A component called *MIG CCTV system*
  existed before the system did and was left in two solutions. Once the system
  exists, replace that stand-in with the real parts recorded on it.

**Generalises to:** anything that delivers security *to* other systems and has a
life of its own — CCTV, door-access control with its controller and badges, a
SOC or monitoring platform, a backup service, a vulnerability scanner, a
certificate authority. It is the security-side twin of the infrastructure
pattern above: that one says what a shared system *holds*; this one says how
other systems *depend* on it.

---

## Pattern: Major and minor departments (an organisation chart deeper than CIRKS)

*Agreed with the owner 2026-10-15, from a customer whose major departments each
have an Information Asset Owner and minor departments under them. **Needed in
the user manual, in training and when filling in the organisation capture
workbook.***

**Scenario.** The customer's organisation chart has two levels: major
departments (Finance, Operations), each with an IAO, and minor departments under
them (Payroll Office and Accounts Payable under Finance). How much of that goes
into CIRKS?

**What a CIRKS department is.** It is not a box on the organisation chart. It
does three jobs, and all three sit at the level where someone is accountable:

- **It owns risks.** A risk belongs to the department that owns its system; the
  accountable person is that department's IAO, or the SIRO if it has none
  (v108).
- **It is the access boundary.** An IAM or IAO reads and edits only their own
  department's assets, systems and services.
- **It owns the records.** Every asset, system and service belongs to exactly
  one department.

Departments are flat: there is no parent department and no roll-up.

**The tempting (wrong) approach.** Record every minor department as a CIRKS
department, to match the chart. Then each one needs its own IAO, or its risks
fall to the SIRO; the major department's IAO cannot see the minor departments'
records, because access stops at the department boundary; and the person the
customer actually holds accountable — the major department's IAO — owns nothing.

**Recommended modelling.** A CIRKS department is the **IAO level**: record the
major departments only. Record a minor department only where it changes a
security answer (the golden rule — *The line*, below):

| What the minor department brings | Where it goes in CIRKS |
|---|---|
| What it does — *"Payroll Office pays staff"* | a **business service** of the major department, named so the minor department is recognisable |
| Its staff as users of a system | a **people group** component, which answers the template's user-group question on the systems they use |
| Its own information or systems | **assets and systems** owned by the major department; say which minor department in the description |
| A manager who keeps its records up to date | an **IAM** in the major department — a department may have several IAMs, and each sees the whole major department |
| A unit that is only a cost centre or a reporting line | nothing: it changes no security answer |

**The test.** Ask *who is accountable when this unit's risk materialises?* If it
is the major department's IAO, the unit belongs inside the major department. If
it genuinely has its own accountable owner who signs off its own risks, it is a
major department in CIRKS terms, whatever the chart says: record it as its own
department, under the customer's name for it, with its own IAO.

**One IAO per department.** If a department has two, CIRKS takes the first by
name as the owner of its risks — a plausible answer nobody chose. Further senior
people in a major department are IAMs, not IAOs.

**Not built, deliberately.** A department hierarchy — CIRKS knowing that Payroll
Office sits under Finance, with Finance's IAO seeing both — would change how
access is scoped across most of the application. It is worth building only if
several customers need minor departments *walled off from each other*, not
merely named.

**In the capture workbook.** *01 Departments*: the major departments only.
*02 Users*: one IAO per major department; managers of minor departments as IAMs
in their major department. *11 Business services*: name the minor departments'
work.

---

## Discussion: one system, two operating systems — and where CIRKS stops

*Raised by the owner, 2026-10-13, and decided the same day: **where the major
parts of a system are different technology stacks, model them as separate
systems.** The rest is kept as the discussion that led there, because the
question runs straight into a boundary that has to be drawn deliberately rather
than crossed one reasonable step at a time. **Needed in the user manual and in
training.***

**Scenario.** A system has two hosts on different operating systems — a Windows
application server and a Linux database server, say. The systems architecture
template asks every system for its operating system. Which one is it?

**What works today.** Record both.

- A template group is *answered* by one of its components, and nothing stops a
  second. Two Misty Isles systems already do this: *Bus Information Displays*
  (AlmaLinux 9 + Windows Server 2025) and *Risk Management System* (Raspberry
  Pi 5 + Ubuntu Server 24.04 LTS).
- A security pattern trigger fires when **any** of its components is recorded,
  so the system is implied the union of what each operating system calls for.
- The picker in a blank group offers one answer; the second operating system is
  added through the search box on the Components tab.

**Where it falls short.** CIRKS knows the system has both. It does not know
which host runs which.

1. *State is per system, not per host.* There is one *EDR agent* record on the
   system, with one state. An agent present on the Windows host and absent from
   the Linux host can only be recorded as **degraded**, and nothing says which
   host is the problem.
2. *A solution implied by one operating system reads as covering the whole
   system.* On *Bus Information Displays* the Windows server implies BitLocker;
   once that part is working, data at rest reads as delivered. The AlmaLinux
   host has no data-at-rest solution and nothing flags it.
3. *Two solutions for one objective is a conflict.* If Windows implied BitLocker
   and Linux implied a Linux equivalent, both delivering the same objective, the
   system would be asked to **choose one**. In a mixed system the true answer is
   *both, one per host*, and that cannot be recorded.
4. *A host and its operating system are not connected.* A host is a technology
   component with a network address; the operating system is another component.
   Nothing records that host A runs Windows.

**The guidance (owner, 2026-10-13).** Encourage people to model **more than one
system** in these cases — specifically when major parts of a system are
different technology stacks.

*The example.* **Tourist Information Points** is recorded on Misty Isles as one
system: *"our tourist display and help point"*, an AlmaLinux server, an EDR
agent and an internal network connection. It is really two things:

- **a server back end delivering data** — a Linux server in a server room, on
  the internal network, administered by IT; and
- **a set of publicly accessible information points** — kiosks standing in
  public places, with a different operating system, physical exposure to anyone
  walking past, and their own connectivity.

As one system its template can never be answered truthfully: *where is it
hosted?* has two answers, and so do *what does it run?* and *who uses it?* On
2026-10-13 it still had four template groups blank — hosting, authentication
service, support team and user group — the questions with two answers. As two
systems each answers the template once, each is implied the
security solutions its own stack calls for, each has its own state, and the
kiosks get the threats that belong to a device in a public place and the server
does not. A business service that needs both simply uses both systems (v104).

*Done on CIRKS-dev 2026-10-15:* the original system became **Tourist
Information Points – back end** (it keeps its server components) and **Tourist
Information Points – kiosks** was added beside it, same department and owners.
The kiosks' template answers are left blank rather than guessed — unanswered
groups are the gaps the department fills in.

**How to tell that it is two systems.** The tell is the technology, not the
people:

- the template has **two true answers** for hosting, operating system or
  connectivity; or
- the parts would be implied **different security solutions**; or
- the parts face **different threats** — one is in a locked room, the other on a
  street.

*Not* a test: *would a different person be called when it breaks?* It was the
first suggestion made, and the owner's objection is right — very often one person
is responsible for everything, and the answer says nothing about the system.

**If it is genuinely one system on two operating systems** — two hosts doing the
same job, a migration in progress — record both operating systems and accept
per-system state. Use *degraded* where one host lacks a part. There is nowhere
on the system's record to say *which* host; the system's description is the only
place today.

**Considered and not taken up.**

- *Letting two solutions both apply to one objective, instead of a conflict.* It
  would remove shortfalls 2 and 3 without modelling a host. The owner does not
  expect mixed systems to be common once they are split as above, so the change
  to how an objective's status is derived is not worth making.
- *Per-host state.* Recording which component is on which host, in what state,
  would answer all four shortfalls. It would also turn every system's record
  into an inventory of its machines, kept up by people whose job is to manage
  risk.

### The line

The owner, on this question: *"There is a point where CIRKS becomes an
architecture modelling system, which it isn't supposed to be. We are skirting
the edge of this and there is a point where the line needs to be drawn."*

CIRKS is a risk system. It holds architecture only as far as risk needs it. The
last few weeks added a template, patterns, triggers, security systems and guided
creation, each for a good reason, and each a step towards describing how systems
are built. The test for the next step, whatever it is — proposed, and confirmed
by the owner on 2026-10-13 as **one of the golden rules of CIRKS training**:

> **Only model things that help answer a security question.** Record an
> architectural fact only if it changes a security answer — which security
> solution is implied, whether an objective is met, what a risk scores, or who
> has to act. A fact recorded only so the picture is complete belongs in an
> architecture tool or a CMDB, and CIRKS should point at that, not copy it.

How the things already built fare against it:

| Recorded | Security answer it changes | Inside the line? |
|---|---|---|
| Which operating system, network, hosting a system has | which solutions are implied | yes |
| Whether a component exists once or per system | where its state is read from | yes |
| That a system is a security system | where a solution's parts may live | yes |
| A component's state on a system | whether the objective is met, the risk score | yes |
| A host's network address or name | which system an event seen in the SOC belongs to (see below) | yes |
| *Which host runs which operating system* | nothing, today | **no** |
| *Component-to-component relationships (depends on, operated by)* | nothing: no status, finding or score read them | **no — retired in v158** |
| *Versions, sizing, network topology, data flows* | nothing | **no** |

**What a host is for.** The owner, 2026-10-13: the purpose of hosts is to link
activity seen on a SIEM — an IP address or a DNS hostname — to a system, so that
a SOC operator can enrich an event with the details of the system it belongs to.
That is all a host is in CIRKS: a lookup key from an address to a system. It is
not a machine record, it carries no operating system and no state, and it is not
the start of an inventory. Which is why shortfall 4 above is not a gap to close.

Two consequences worth holding to:

- **Granularity stops at the system.** State, solutions and risks are per
  system. When one system needs two answers, the first question is whether it is
  two systems, not whether the model needs a level below.
- **Coarse and honest beats fine and stale.** *Degraded, see note* kept current
  is worth more to a risk owner than a per-host record nobody maintains.

**The rule applied once already.** Component-to-component relationships
(*operated by*, *depends on*, *documented by*) were the first thing tested
against it, and failed: nothing that decides a status, a finding or a score read
them, and what a control depends on is said by its security solution. The owner
retired them on 2026-10-13 (v158), together with the system page's Graph tab,
which drew them. Anything of that kind that matters is recorded as a part of a
security solution.
