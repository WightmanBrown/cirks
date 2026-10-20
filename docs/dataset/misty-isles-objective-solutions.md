# Misty Isles — a security solution for every control objective

**Answered by the owner 2026-10-07 (§6) and applied to a copy of CIRKS-dev (§7). Not yet applied to CIRKS-dev or CIRKS-test.** Applied by `riskapp/db/dataset/misty-isles/objective-solutions.js`.

Owner's ruling (2026-10-07): *"All of the control objectives for the organisation
must by implication have security solutions or they are 'not applicable'. Any
control objective which does not have a security solution must have one built and
the components identified."* An objective with no solution will read **missing**
on every system (stage 2 of `docs/system-security-view.md` §7), so what is
proposed here decides how many of those are real gaps and how many are a library
that was never written down.

## 1. Where the library stands

| How the objective is delivered | Applicable | With a security solution | Without |
|---|---|---|---|
| on each system | 38 | 15 | **23** |
| once for the organisation | 48 | 0 | 48 |
| for a group | 2 | 0 | 2 |
| not stated | 18 | 0 | 18 |

This note covers the **23 delivered on each system, plus ID.RA-09** (delivery not
stated, recorded on 15 systems): they are the ones whose status is per system and
so the ones stage 2 turns to *missing* — 363 rows, 330 of them marked operational
or degraded today, carrying 298 judged residuals. The 68 organisation-wide, group
and not-stated objectives are listed by the new finding (§5) and are a second
piece of work: their status is already derived from their components (v129).

The component lists on the objective pages were the starting point. They cannot
be converted mechanically: a list is *alternatives, not a checklist*
(`docs/control-delivery-patterns.md`) — PR.AA-06 lists four server rooms, and no
system is in four rooms.

## 2. Add the objective to a solution that already exists

No new parts. The solution already does this job; the library just does not say so.

| Objective | Systems | Add it to | Why |
|---|---|---|---|
| DE.AE-02 adverse events are analysed | 11 | CrowdStrike EDR, Microsoft Defender for Servers (Azure), Wazuh agent (OT), Syslog to Wazuh (network appliances) | Its list is exactly their service parts: Crowdstrike SaaS, Detective Monitoring, InfoSec Team, Wazuh |
| PR.AA-01 identities and credentials are managed | 18 | Active Directory (on-premises), Entra ID (cloud) | Its list is Microsoft Active Directory Domain Services |
| PR.AA-03 users, services and hardware are authenticated | 20 | Active Directory (on-premises), Entra ID (cloud) | Same |
| PR.AA-04 identity assertions are protected, conveyed, verified | 6 | Active Directory (on-premises), Entra ID (cloud) | No list. Kerberos and SAML assertions are what those two issue — **Q1** |
| PR.IR-03 resilience mechanisms | 26 | Veeam backup, Azure Backup, Microsoft 365 Backup | Its list is *Resilience and recovery*, already a part of Veeam backup — **Q2** |
| RC.RP-02 recovery actions are performed | 8 | Veeam backup, Azure Backup, Microsoft 365 Backup, Configuration backup (network appliances) | Same list; they already deliver RC.RP-01 and RC.RP-03 |

Each of those solutions is already triggered by a component the systems record
(the operating system, the hosting, the sign-in), so the objective follows it
onto the right systems with no new rule. Systems hosted by a supplier get these
through **Provided by the supplier**, which would gain the same objectives.

## 3. New solutions, from the component lists

| Proposed solution | Delivers | Parts (where each lives) | Triggered by |
|---|---|---|---|
| **Secure datacentre — Bank Street** | PR.AA-06, DE.CM-02, PR.IR-02 | Bank Street server room (organisation), Physical security (organisation) | Bank Street server room |
| **Secure datacentre — The Castle** | PR.AA-06, DE.CM-02 | The Castle server room (organisation), Physical security (organisation) | The Castle server room |
| **Secure datacentre — Shark Point** | PR.AA-06, DE.CM-02 | Shark Point Server Room (organisation), Physical security (organisation) | Shark Point Server Room |
| **Secure premises — MIG Official Premises** | PR.AA-06 | MIG Official Premises (organisation), Physical security (organisation) | MIG Official Premises |
| **Patch and configuration management (ME End-Point Central)** | PR.PS-01, PR.PS-02 | ME End-Point Central (organisation), IT Administrators (organisation), System configuration (organisation), Vulnerability management (organisation) | Windows 10, Windows 11, Windows Server 2016, Windows Server 2025, Ubuntu Server 24.04 LTS, AlmaLinux 9 |
| **Data-at-rest protection** | PR.DS-01 | Data handling policy, Data protection and handling, Encryption Standard (all organisation) | **Q3** |

One per facility, because the rooms are alternatives. The owner's own empty
*Secure Datacentre* solution on CIRKS-dev would be replaced by these — **Q4**.

Two of these will read **degraded** the moment they exist, correctly: *The Castle
server room* and *ME End-Point Central* are both recorded as degraded for the
organisation. That degrades PR.PS-01 and PR.PS-02 on every Windows and Linux
system at once, which is what an organisation-wide component in a degraded state
means.

## 4. Probably not per-system at all

These are recorded on systems, but what delivers them is one process for the
whole organisation. The simpler correction is the **delivery mode** — *once for
the organisation* — after which there is no per-system status to derive, and the
objective is delivered by the process itself.

| Objective | Systems | Its list |
|---|---|---|
| ID.RA-10 critical suppliers are assessed before acquisition | 16 | Supply chain management |
| DE.CM-06 external service providers are monitored | 16 | Supply chain management |
| ID.AM-04 inventories of supplier services | 15 | Supply chain management |
| ID.RA-08 vulnerability disclosure process | 14 | Vulnerability management |
| ID.AM-01 inventories of hardware | 11 | Asset management |
| ID.AM-02 inventories of software, services and systems | 5 | Asset management |

**Q5**: change their delivery to organisation-wide? On a system they only ever
meant "this system is in the inventory / this supplier was assessed", which the
register and the supplier records now say directly.

## 5. Nothing listed — the owner has to say what delivers these

| Objective | Systems | Judged residuals |
|---|---|---|
| PR.IR-04 adequate resource capacity | 26 | 35 |
| PR.PS-03 hardware is maintained, replaced, removed | 22 | 21 |
| ID.AM-08 managed throughout their life cycles | 15 | 12 |
| ID.RA-09 authenticity and integrity of hardware and software assessed | 15 | 11 |
| PR.PS-06 secure software development | 8 | 8 |
| ID.RA-02 cyber threat intelligence is received | 6 | 6 |

Somebody judged what each achieves on a risk (the residuals) without anything
being recorded as delivering it. **Q6**: for each — what is the solution, is it
organisation-wide (§4), or is it not applicable to Misty Isles?

## 6. Questions, and the owner's answers (2026-10-07)

1. **PR.AA-04** — deliver it with Active Directory and Entra ID? **Yes.**
2. **PR.IR-03** — backup, or failover? **Failover is correct, not backup.** So it
   is not added to the backup solutions. It gets its own solution, *Failover to
   the Castle Vaults DR room*, whose on-system part is the failover arrangement
   itself (a new component). RC.RP-02 stays with the backup solutions.
3. **PR.DS-01** — a product? **BitLocker and FileVault, added as technology
   components.** Two solutions, triggered by Windows and by macOS.
4. **Datacentres** — **treat one of the two on-premises datacentres as good and one
   degraded (Bank Street and The Castle).** That is how the two facilities are
   already recorded, so the per-facility solutions read it from them; nothing is
   forced. The owner's empty *Secure Datacentre* becomes *Secure datacentre — Bank
   Street*.
5. **§4** — organisation-wide delivery for those six? **Yes.**
6. **§5** — **"I'll fix those six by hand."** The script does not touch them.

One addition made while applying it: PR.IR-02 (environmental threats) is given to
all three datacentre solutions, not only Bank Street's as its component list had
it. A system in The Castle would otherwise have no solution for it at all.

## 7. What applying it does (measured on a copy)

Applied through the API to a copy of CIRKS-dev carrying v152–v154, then every one
of the 228 active risk scores compared. A second run changes nothing.

**What it adds:** 3 components (BitLocker, FileVault, Failover to Castle Vaults DR
room), 8 solutions, 34 objective-to-solution links, 23 parts, 7 trigger rules with
15 triggers; 6 objectives become organisation-wide.

**What people had stated is carried over.** Where an objective was marked
operational or degraded on a system and its new solution has a part that lives on
the system, that part is recorded there in the same state: BitLocker on 10
Windows systems, the failover arrangement on 20. 30 in all. Nothing is claimed
that was not claimed before.

**Six risk scores rise; none falls.** At or above the mandatory-action score:
56 → 60.

| Risk | Score |
|---|---|
| Billing and meter reading — Data exfiltration | 12 → 20 |
| Billing and meter reading — Stolen or compromised credentials | 8 → 16 |
| Billing and meter reading — Accidental data disclosure | 4 → 12 |
| Flight operations system — Unauthorised data modification | 9 → 15 |
| Approach radar — Exploitation of an unpatched vulnerability | 10 → 15 |
| Flight operations system — Stolen or compromised credentials | 4 → 9 |

Billing and Flight operations are run by suppliers: their identity and
data-at-rest objectives are now *Provided by the supplier*, and no current
evidence from the supplier covers them. That is the supplier-assurance finding
arriving in the risk score.

**What it exposes, by objective** (state on the systems that record it):

| Objective | Operational | Degraded | Missing | Why |
|---|---|---|---|---|
| PR.DS-01 data at rest | 10 | — | 26 | 10 Linux servers have no encryption solution at all; 5 SaaS systems have no supplier evidence; 5 Windows systems never claimed it; 6 others (OT, appliances) |
| PR.PS-01 configuration management | — | 28 | 9 | ME End-Point Central is recorded degraded for the organisation; the 9 are systems it does not manage |
| PR.PS-02 software maintenance | — | 28 | 13 | Same |
| PR.AA-06 physical access | 26 | 6 | 5 | The 6 are in The Castle; the 5 record no facility with a solution |
| DE.CM-02 / PR.IR-02 physical environment | 24 | 6 | 2 | Same |
| PR.IR-03 failover | 20 | — | 6 | The 6 were already marked missing |

**The finding afterwards** (objectives with no solution): 79, down from 91 — per
system 5 (the owner's six less one already not stated), organisation-wide 54, for
a group 2, not stated 18.

## 8. Follow-ups this raises

- **Linux servers have no data-at-rest solution.** LUKS, or storage-level
  encryption, would be a third solution; until then PR.DS-01 reads missing on 10.
- **ME End-Point Central degraded** now degrades patching and configuration on 28
  systems at once. If it is not really degraded, correct the component.
- **The six organisation-wide objectives still have no solution**, like the other
  48: their status comes from the objective's own implementation status (v129).
