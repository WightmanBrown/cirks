# Misty Isles — a security solution for every control objective

**Answered by the owner 2026-10-07 (§6) and 2026-11-23 (§9).** Applied by `riskapp/db/dataset/misty-isles/objective-solutions.js`.

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

## 9. The objectives delivered once that counter a threat (owner, 2026-11-23)

Found from the risk page's new picture of *Why this score?*: CIRKS1.SAT-01 read
**in place** (the Statement of Applicability says implemented, and an objective
delivered once takes its status from it, v129) while the picture said **no
security solution**. Both were true; the record was incomplete. 98 applicable
objectives still had no solution, 18 of them countering a threat. Five of those
the owner is building by hand (§5 / Q6: BRR-07, EST-05, SCM-08, SD-01, IRM-06).
The owner approved a solution for each of the other 13, from components already
in the library, every part delivered once for the organisation:

| Objective | Solution (pattern) | Parts (slot) |
|---|---|---|
| SAT-01 Security awareness programme | Security awareness programme (KnowBe4) (P2) | Security awareness training (process), KnowBe4, Security awareness completions (KnowBe4) (evidence), All desktop users |
| SAT-02 Role-based training | Role-based security training (P2) | Security awareness training (process), IT Administrators, Policy acknowledgements — IT and security staff (evidence) |
| AA-05 Access is reviewed | Access review (P2) | User account management process (process), Access Control and Account Management Policy (defined by), IT Administrators (responsible), Microsoft Active Directory Domain Services, Microsoft Entra ID |
| AA-06 Segregation of duties | Defined roles and separation (P2) | User account management process (process), ISMS Roles and Responsibilities (defined by), Access Control and Account Management Policy |
| IDA-06 Service and system accounts | Service account management (P2) | User account management process (process), Access Control and Account Management Policy (defined by), Microsoft Active Directory Domain Services, IT Administrators (responsible) |
| BRR-04 Recovery objectives | Recovery planning and exercise (P4) | Data Backup and Recovery Policy (plan), Resilience and recovery, Incident response exercise reports (exercise) |
| EST-03 Devices register | Device inventory (P3) | ME End-Point Central (record), Asset management (maintained by) |
| EST-04 Software register | Software inventory (P3) | ME End-Point Central (record), Asset management (maintained by), Systems Register Standard (standard) |
| EST-06 Asset return and disposal | Asset return and disposal (P2) | Asset management (process), User account management process, IT Team (responsible) |
| PHY-08 Equipment maintenance | Equipment maintenance (P2) | IT Team (responsible), Physical security maintenance log (evidence), Server room HVAC |
| DM-05 Monitoring coverage | Security monitoring coverage (P5) | Wazuh (security system), InfoSec Team (team), Detective Monitoring Policy (policy), Detective Monitoring |
| SD-10 Vulnerability reports are handled | Vulnerability report handling (P2) | Vulnerability management (process), Vulnerability Management Policy (defined by), InfoSec Team (responsible) |
| CS-03 Device identification (802.1X) | Network access control (ExtremeCloud IQ Site Engine) (P5) | ExtremeCloud IQ Site Engine (security system), **802.1X network access control** (new, per system, on the system), Network Security Policy (policy) |

CS-03 is not implemented (the SoA): the 802.1X part is recorded on no system, so
the solution reads incomplete until one is. DM-05's link to *Supply chain
management* was a mislink and is removed.

**Measured on a copy of CIRKS-dev:** 13 solutions, 43 parts, one link removed;
objectives with no solution 98 → 85; **no risk score and no objective status
changed** (an objective delivered once keeps the SoA's status; the solution says
how it is delivered).

**The risk page** (the *Why this score?* picture, PR "Why this score? as a picture") reads a solution's state for an objective delivered once from
its parts (the state views cover per-system objectives only), and the best of its
solutions is the one in use. Report only. SAT-02 shows the gap that leaves: the
SoA says *partial*, while every part of its solution is operational.

**Still open:** the 80 objectives with no components listed, none countering a
threat (a question round like §5), and the five above.

## 10. The non-technical objectives get solutions (owner, 2026-11-23)

After §9, 85 objectives still had no security solution. The owner: *"close the
gap … that should be straightforward for the non-technical stuff."* Every one
below is built from components already in the library (one new process,
*Change management*); no product had to be chosen.

| Solution (pattern) | Objectives |
|---|---|
| **CIRKS itself** (chosen; `src/lib/cirksDelivers.js`) | IRM-01 risk rating methodology, IRM-05 security action plan, IRM-08 risk acceptance, IRM-09 risk reporting, RAST-01 information risk assessments |
| **ISMS process** (P2, existing) | IRM-07, IRM-10, IRM-11, IRM-12, IRM-13, IRM-14, IRM-15 |
| **Incident management process** (P2, new) | IR-02 reporting, IR-03 triage, IR-05 evidence, IR-06 external notification, IR-07 lessons learned |
| **Account management process** (P2, new) | AA-02, AA-04, AA-10, IDA-02, IDA-03, PER-04 |
| **HR security process** (P2, new) | PER-01 screening, PER-03 disciplinary process |
| **Security testing and audit** (P2, new) | RAST-02 – RAST-06 |
| **Change management** (P2, new; its procedure is not written, so its *defined by* slot is empty) | CVM-03, SD-08 |
| **Acceptable Use Policy** (P1, existing) | PER-02, DCH-12, PHY-09, CVM-07, PHY-10 |
| **Information classification and handling policy** (P1, existing) | DCH-07, DCH-08, DCH-10, DCH-11 |
| **Supply chain security policy** (P1, existing) | SCM-04, SCM-07, SCM-09, SD-09 |
| **AI usage policy** (P1, existing) | AI-02, AI-03, AI-07, AI-08 |
| **Vulnerability management policy** (P1, existing) | SVM-05 exceptions are risk managed |
| **The three secure datacentres** (P8, existing) | PHY-01 perimeters, PHY-03 secure areas, PHY-06 siting and utilities, PHY-07 cabling |
| **Security awareness programme (KnowBe4)** (P2, §9) | SAT-03 phishing, SAT-04 training is tracked |

A solution does not change an objective's status: those delivered once keep the
SoA's word, so the ones still *planned* or *not implemented* (the AI ones,
IRM-10/11/12/14/15, supplier contracts and exit, lessons learned) have a
solution saying how they will be delivered and still read as they did.

**Measured on a copy of CIRKS-dev** (with §9): objectives with no security
solution **98 → 29**; **no risk score changes** (69 of 227 at or above 12).

**Left:** five the owner builds by hand (BRR-07, EST-05, SCM-08, SD-01, IRM-06);
secure development (SD-02, SD-03, SD-04, SD-07), to arrive with its policy
(SD-01); and the technical ones below.

### Technical questions for the owner

Each needs a product or a decision. Where the library has a likely candidate it
is named; *not implemented* in the SoA is noted, since "not applicable to Misty
Isles" is also an answer.

| # | Objective | Question | Candidate in the library |
|---|---|---|---|
| T1 | CS-07 Web and email filtering | What filters web traffic, and what filters email? | PAN-OS URL filtering on the PaloAlto 850-22; Microsoft Defender XDR for email |
| T2 | CS-14 Trust in our email *(partial)* | Are SPF, DKIM and DMARC published for MIG's mail domains, and who keeps the DNS records? | Microsoft 365 (no component yet) |
| T3 | CS-10 Trust in our DNS domains *(not implemented)* | Who hosts MIG's DNS zones? Is DNSSEC planned, or not applicable? | none |
| T4 | CS-09 Trust in our encrypted external services | How are certificates for public services issued and renewed, and by which authority? | none |
| T5 | CS-11 Volumetric attack protection *(not implemented)* | Does the internet provider or Azure give DDoS protection, or is the risk accepted? | External internet; Azure cloud network |
| T6 | CS-06 Wireless networks | Does ExtremeCloud IQ Site Engine run the wireless, and with what authentication (WPA3-Enterprise, 802.1X)? | ExtremeCloud IQ Site Engine |
| T7 | CS-05 Network services are secured | Which network services (DNS, DHCP, NTP) run where, and what hardens them? | PAN-OS; Microsoft Active Directory Domain Services |
| T8 | CS-08 Secure administration | How do administrators reach systems: jump hosts, the VPN with MFA, privileged workstations? | PaloAlto GlobalProtect gateway; Entra ID sign-in |
| T9 | CS-13 Admin accounts without email or internet | Are admin accounts separate, with no mailbox, and blocked from the web? By what? | Microsoft AD DS; Microsoft Entra ID; PaloAlto 850-22 |
| T10 | CVM-05 Removable media and ports | What blocks or controls USB storage? | CrowdStrike (device control); ME End-Point Central |
| T11 | CVM-06 Mobile and portable devices | What manages MIG's phones and tablets? | none (Intune would be new) |
| T12 | DCH-09 Data leakage prevention *(not implemented)* | Planned (e.g. Microsoft Purview), or accepted for now? | none |
| T13 | DM-03 Clock synchronisation | What is the time source, and do servers and network devices follow it? | Microsoft AD DS (domain time); PAN-OS |
| T14 | DM-10 Application-specific logging *(not implemented)* | Which applications must log, and to where? | Wazuh |
| T15 | IDA-07 Central log of accounts | Is Active Directory / Entra ID the central record of accounts? | Microsoft AD DS; Microsoft Entra ID |
| T16 | AA-08 Privileged utility programs | What restricts powerful utilities (PowerShell, admin tools)? | CrowdStrike; ME End-Point Central |
| T17 | AA-11 Role-based access control | Is RBAC per application (then it belongs on each system), and is it AD groups? | Microsoft AD DS; Microsoft Entra ID |
| T18 | SD-05 Separate environments, SD-06 Source code protected | Does MIG develop in-house, and where is the code kept? (With secure development.) | none |
| T19 | OT.T-01 OT attack surface *(not implemented)* | Is the OT networks' isolation (Zero trust isolation, Legacy system isolation) the intended solution? | Zero trust isolation; Legacy system isolation |

## 11. The owner's answers to the technical questions (2026-11-23)

| # | Answer | Built |
|---|---|---|
| T1 | Both | *Web and email filtering (PAN-OS and Defender)* (P5) |
| T2 | Agreed | *Email authentication (SPF, DKIM, DMARC)* (P6); new components Microsoft 365 email (Exchange Online), SPF/DKIM/DMARC records |
| T3 | DNSSEC with GoDaddy | *DNSSEC (GoDaddy)* (P6); new component GoDaddy DNS hosting |
| T4 | MIG CA Operation Ltd | *Public certificates (MIG CA Operation Ltd)* (P5); new component MIG CA Operation Ltd |
| T5 | Azure network and the Unsure Networks ISP link | *DDoS protection (Azure and Unsure Networks)* (P5); new component Unsure Networks internet link |
| T6 | Agreed | *Wireless (ExtremeCloud IQ)* (P5) |
| T7 | Agreed | *Network services hardening* (P6): PAN-OS, AD DS, CIS Benchmarks |
| T8 | Agreed | *Secure administration (GlobalProtect with MFA)* (P5) |
| T9 | A procedural control for administration accounts, backed by a policy | CS-13 added to the *Account management process* (§10) |
| T10 | Agreed | CVM-05 added to *CrowdStrike EDR* and *Patch and configuration management (ME End-Point Central)* |
| T11 | Add Intune and Jamf | *Mobile device management (Microsoft Intune)* and *(Jamf)* (P5), one per platform; new components |
| T12 | Accept for now | the finding accepted for a year, reviewed annually |
| T13 | AD or PAN-OS, using a GPS source | *Time from Active Directory (GPS source)* and *Time from PAN-OS (GPS source)* (P6); new component GPS time source |
| T14 | Wazuh and a syslog server | *Application logging (Wazuh and syslog)* (P5); new component Syslog server |
| T15 | Agreed — "but what about Linux?" | *Central account record (Active Directory and Entra ID)* (P3). The 16 Linux systems sign in through the directory (15 joined to AD, the GIS Land Register through Entra ID), so their user accounts are in it; their local accounts (root, service accounts) are the service-account process's |
| T16 | Agreed | AA-08 added to CrowdStrike EDR and ME End-Point Central |
| T17 | Agreed, but also application-specific, like CIRKS | AA-11 added to *Active Directory* and *Entra ID*; new *Application role-based access* (P6) with a per-system part, *Role-based access in the application* |
| T18 | MIG does no development: not applicable | SD-05 and SD-06 ruled **not applicable** in the SoA, with that reason (their old descriptions mentioned Azure subscriptions and Azure DevOps; nothing else in the story does) |
| T19 | Yes, and both should be added | OT.T-01 added to *Legacy system isolation*; new *OT zero trust isolation* (P5) |

**Implemented** (owner): DNSSEC (CS-10), DDoS protection (CS-11) and
application logging (DM-10) are in place, so the SoA says implemented, with
what delivers each. None counters a threat, so no score moves; their
effectiveness stays unrated (§ the effectiveness ratings: newest areas).

**Measured on a copy of CIRKS-dev with §9–§11:** objectives with no security
solution **98 → 11** before T4, **10** with it (one of them, data leakage
prevention, accepted); **no risk score changes** (69 of 227 at or above 12).

**Still open:** the five the owner builds by hand; and secure development
(SD-01 – SD-04, SD-07), which stays applicable: MIG does no development now but
might in future (owner).
