# Misty Isles — the estate, as a story

**Agreed with the owner, 2026-09-30 (answers in §8). Nothing in the data has changed yet.**

The Misty Isles Government (MIG) is the training dataset on CIRKS-test, and it is
refreshed to CIRKS-dev from there. It was built by testing scenarios one at a time,
so it is partial and not representative (audit, 2026-09-30):

- 145 of 153 "degraded" controls have no degraded part anywhere;
- 181 "operational" controls have none of their technology recorded;
- no risk above High, although 19 systems carry Severe impact;
- no review cycles.

This sheet describes the estate **as a real organisation would have it**. The data
is then **derived** from the sheet, not edited count by count, so it stays
consistent: every control status traces to a recorded part, and every problem has
a reason.

**Kept as they are:**
- departments and people;
- the 51 systems, and their information assets;
- business services and their links to systems (curated by the owner);
- the threat catalogue;
- the NIST CSF library.

**Rebuilt from this sheet:**
- the components on each system;
- control status;
- delivery patterns;
- suppliers and evidence;
- risk judgements;
- a year of governance history.

---

## 1. Sites

| Site | What it is |
|---|---|
| **Bank Street server room** | Primary data centre: most IT servers and the security platforms |
| **The Castle server room** | Secondary data centre: identity, email, file storage, Justice |
| **Shark Point Server Room** | Operational-technology (OT) site: port, utilities control, radar back-ends |
| **Castle Vaults DR room** · **Crow's Nest Disaster Management Centre** | Disaster recovery and the incident-response rooms |
| **MS O365 UK South** | Microsoft 365 tenant (and the small Azure footprint below) |
| Field sites | Airport ATC tower and fuel bunker, water treatment works, mobile/field kit |

## 2. Five hosting classes — each implies its security stack

| Class | Endpoint protection | Backup | Data in transit | Notes |
|---|---|---|---|---|
| **IT on-premises** (Windows/Linux servers, desktops) | **CrowdStrike EDR**: Falcon agent → *Host Intrusion Detection System* | **Veeam** → *MIG Backup* | **TLS 1.2+** on every service; **VPN** for remote users | The default MIG estate |
| **Azure-hosted** (new, small) | **Microsoft Defender for Servers** → *Microsoft Defender for Cloud* | **Azure Backup** (supplier) | TLS | The owner's "second stack" example: GIS Land Register, Electoral Roll |
| **SaaS** | *provided by the supplier*, met by its evidence | supplier | supplier (TLS) | Each has a service-provider relationship |
| **Operational technology** (radar, power, water, fuel) | **Wazuh agent** on the Linux/Windows historians and HMIs → *Security monitoring platform*. CrowdStrike is not certified on the vendors' OT builds | Veeam for the historian/config servers | Segmented network; **NIDS** watches it | Vendors maintain the controllers under contract |
| **Infrastructure / security services** | as IT on-premises, where the device can run an agent; **network appliances send syslog to Wazuh** → *Security monitoring platform* | configuration backups | management plane over TLS/SSH | These *are* the services the patterns rely on |

## 3. Security services (systems the delivery patterns rely on)

| Service (system) | Its parts the patterns rely on | Supplier |
|---|---|---|
| **Host Intrusion Detection System** | Crowdstrike SaaS console · InfoSec Team (SOC) · Detective Monitoring process | CrowdStrike (product) |
| **Security monitoring platform** | Wazuh manager/SIEM · InfoSec Team · Detective Monitoring | — (open source, run in-house) |
| **Network Intrusion Detection System** | PaloAlto 850-22 · Palo Alto ATP · InfoSec Team | Palo Alto Networks (product) |
| **MIG Backup** | Veeam Backup · Resilience and recovery process · IT Administrators | Veeam (product) |
| **MIG Remote Access VPN** *(new system)* | PaloAlto GlobalProtect gateway on the PaloAlto 850-22 · IT Administrators | Palo Alto Networks (product) |
| **Microsoft Defender for Cloud** *(new system)* | Defender for Servers · InfoSec Team | Microsoft (service provider) |
| **MIG Authentication, Authorisation and Access Control system** | Active Directory · Entra ID · IT Administrators | Microsoft |

Named parts matter (the owner's answer to question 2). *ME End-Point Central* sits on
MIG Backup, but the backup pattern does not rely on it. So when it is degraded,
patching suffers and backups do not.

## 4. Delivery patterns — first set

| Control objective | Patterns (a system needs one complete pattern) |
|---|---|
| DE.CM-09 endpoint monitoring · DE.AE-03 adverse-event analysis | CrowdStrike EDR · Wazuh agent (OT) · **Syslog to Wazuh** (network appliances) · Defender for Servers (Azure) · *by the supplier* (SaaS) |
| DE.CM-01 network monitoring | NIDS (PaloAlto ATP) — for infrastructure and OT segments |
| PR.DS-11 backups | Veeam → MIG Backup · Microsoft 365 Backup · Azure Backup · *by the supplier* |
| PR.DS-02 data in transit | **TLS** (new library entry: a configuration, per system) · Remote-access VPN · Secure radio (Plotnet) · Signal · *by the supplier*. **Starlink and OneWeb are removed** from PR.DS-02: they are transport, not encryption |
| PR.AA-05 access permissions | Active Directory (on-premises) · Entra ID (M365/Azure) · *by the supplier* |

## 5. The systems

Class key: **IT** on-premises · **AZ** Azure · **SaaS** · **OT** · **INF** infrastructure/security service.

| Department | System | Class | Notes for the story |
|---|---|---|---|
| DEFA | Environmental GIS research platform | IT | Field kit: Starlink/OneWeb links, Signal, secure radio for field teams; VPN back to base |
| DEFA | Fisheries management system | IT | |
| Communications | IT Support Ticketing System | SaaS | *Helix ServiceDesk* (fictional), which also hosts the knowledge base |
| Communications | Support Knowledge base | SaaS | *Helix ServiceDesk* |
| Communications | MIG Authentication, Authorisation and Access Control | INF | AD on-premises plus Entra ID; CrowdStrike on the domain controllers (**missing today**, added) |
| Communications | MIG Backup | INF | The backup service; immutable offsite copy |
| Communications | MIG Corporate Email | IT | **Exchange 2019 on-premises, out of support since Oct 2025**: the product end-of-support finding (supplier step 4) |
| Communications | MIG Desktop (internal) | IT | Windows 11, CrowdStrike, Microsoft 365 Apps; OneDrive via M365 Backup |
| Communications | MIG Desktop (remote) | IT | As internal, plus the VPN |
| Communications | MIG Document Management | SaaS | SharePoint (Microsoft); M365 Backup |
| Communications | MIG File storage | IT | Windows Server 2016 (support ends Jan 2027); CrowdStrike (**missing today**, added) |
| Communications | MIGNet | INF | Network devices: **syslog to Wazuh**; watched by NIDS |
| Communications | MIG Telephony and Messaging | SaaS | Teams Phone (Microsoft) |
| Communications | MIG Video Conferencing | SaaS | Teams (Microsoft) |
| Education | Pupil/student records system | IT | Severe impact, phishing-exposed staff: **one of the Critical risks** |
| Education | Schools facilities management | SaaS | *FacilityFlow* (fictional) |
| Education | Student Desktop | IT | Shared lab PCs; CrowdStrike on only some of them (**degraded**) |
| InfoSec | Host Intrusion Detection System | INF | The CrowdStrike EDR service |
| InfoSec | Information Security Management System | SaaS | The policies and records, in SharePoint; CIRKS itself is the *Risk Management System* (§8.4) |
| InfoSec | Information Security Playbooks | IT | Printed at both response rooms, master in SharePoint |
| InfoSec | Network Intrusion Detection System | INF | The NIDS service |
| InfoSec | Security monitoring platform | INF | The Wazuh SIEM service |
| InfoSec | **MIG Remote Access VPN** | INF | **New system**: the VPN service |
| InfoSec | **Microsoft Defender for Cloud** | SaaS | **New system**: the Azure endpoint service |
| Roads & Airports | Aircraft fuelling | OT | Fuel control system maintained under contract by *Harbour Fuel Services* (fictional) |
| Roads & Airports | Approach radar | OT | Radar maintained under contract by *Aerowatch Systems* (fictional); **Wazuh agents two versions behind (degraded)** |
| Roads & Airports | **Driver and Vehicle Licensing System** | IT | Merged from *Driver licensing system* and *Vehicle Licensing System* (owner, §8.2) |
| Roads & Airports | Flight information display | IT | |
| Roads & Airports | Flight operations system | SaaS | *SkyPlan Ops* (fictional) |
| Roads & Airports | Maritime and Aviation Radio Communications System | OT | Encrypted by secure radio; endpoint controls not applicable to the radios |
| Disaster & Emergency | Emergency Communications System | IT | Secure radio |
| Maritime | Costal Radar and Ship Tracking | OT | Radar back-end on Windows: Wazuh |
| Maritime | Port operations system | IT | |
| Justice | Case Management System | IT | |
| Justice | Court Management System | IT | |
| Justice | Criminal Records and Firearms Licensing System | IT | Mid-migration from OSSEC to CrowdStrike: **OSSEC being retired**; assets re-rated to **Severe** (owner, §8.3) |
| Justice | Prison Management System | IT | **Windows 7 + Microsoft Access**: unsupported; CrowdStrike cannot run; **an accepted exception** until the 2027 replacement |
| Treasury | MIG Banking System | SaaS | The banking portal, provided by *Island Mutual Bank* (fictional) |
| Treasury | Tax Records System | IT | |
| Treasury | Treasury Accounting System | IT | |
| Utilities | Billing and meter reading | SaaS | *Super Bill* (fictional): **its SOC 2 report has expired**, so the assurance finding reads *expired* |
| Utilities | GIS Land Register | AZ | Defender for Servers; Azure Backup |
| Utilities | Power Distribution | OT | Control systems maintained by *Gridline Controls* (fictional) |
| Utilities | Power Generation | OT | Wazuh (CrowdStrike recorded today, corrected) |
| Utilities | Water Distribution | OT | Wazuh; **last backup restore test failed (degraded)** |
| Cabinet Office | **Electoral Roll** | AZ | Defender for Servers; Azure Backup (name corrected, §8.5) |
| Cabinet Office | HR System | SaaS | *PeopleFirst HR* (fictional): **contract has no exit or data-return terms** (assurance partial) |
| Cabinet Office | Risk Management System | IT | CIRKS itself |
| Health | Medical Imaging System | IT | Scanners are vendor-managed; image store on Ubuntu |
| Health | Medical Planning System | IT | |
| Health | Medical Records System | IT | Severe impact: one of the Critical risks |
| Health | Pharmacy Inventory System | IT | Veeam recorded, yet backup marked missing today (corrected) |

## 6. The deliberate problems

Each one is explainable, sits on a named part, and is what a real organisation would
be working on:

1. **Exchange 2019 out of support** (Corporate Email): product end-of-support.
2. **Prison Management System on Windows 7**: no EDR possible; an accepted exception.
3. **Wazuh agents behind on Approach radar**: degraded endpoint monitoring.
4. **Water Distribution backup restore test failed**: degraded backups.
5. **VPN without MFA for contractors**: the VPN service is degraded, so every remote-access system shows it at once.
6. **Student Desktop only partly covered by EDR**: degraded.
7. **ME End-Point Central degraded**: patching (PR.PS-02) suffers, and nothing else does.
8. **Super Bill's SOC 2 report expired**: supplier assurance *expired*.
9. **PeopleFirst HR has no exit terms**: supplier assurance *partial*.
10. **OSSEC retirement half-done** on Criminal Records: two stacks during migration.

**Risk picture target:**
- 6–10 **Critical** and 1–2 **Catastrophic** risks, on the Severe-impact systems the problems touch;
- a spread of High, Medium and Low;
- a validation backlog of a dozen or so;
- a few risks accepted by exception.

**Governance history target:** the past year in quarterly cycles, including:
- 4 review cycles, 3 of them closed and frozen;
- 4 SWG meetings with minutes;
- about 40 security actions across every state;
- about 8 exceptions, one of them lapsed;
- about 14 suppliers with evidence in varied states.

Dates are relative to today, so the dataset does not rot.

## 7. How it will be built

1. **Library (data fix):**
   - classify all 157 components (scope; part vs plain inventory);
   - add TLS, Defender for Servers, Azure Backup and Entra ID;
   - take Starlink and OneWeb out of PR.DS-02;
   - give components to the 7 deployed objectives that have none.
2. **Systems (data fix):**
   - the two new service systems;
   - components per hosting class;
   - control status derived from recorded parts;
   - the deliberate problems placed on named parts, with reasons;
   - endpoint controls marked not applicable where devices cannot run agents.
3. **Suppliers and evidence (data fix)**, as in section 5.
4. **Risk judgements and a year of governance, through the real API as each
   persona** (`db/isms-cycle.js`), so the audit trail reads as people doing the work.
5. **Check:** the audit is re-run and every figure in it must make sense.
6. **Refresh CIRKS-dev from CIRKS-test** (owner approved, 2026-09-30).

Delivery patterns are not built yet. In this pass they shape the data: the right
parts are on the right systems. The pattern model itself is a separate piece of work.

## 8. Decisions (owner, 2026-09-30)

1. **OT runs Wazuh, not CrowdStrike. Network appliances send syslog to Wazuh.** There
   is a small Azure footprint: GIS Land Register and the electoral roll.
2. **Driver licensing and Vehicle Licensing merge** into one *Driver and Vehicle
   Licensing System*.
3. **Criminal Records and Firearms Licensing** has its assets re-rated to **Severe**.
4. **The ISMS is the policies and records** (SharePoint). The **Risk Management
   System is CIRKS** itself.
5. **"Electoral Role" becomes *Electoral Roll*.**
6. **Fictional names** for the SaaS and contract suppliers. Real vendors appear only
   as products.

## 9. The security architecture (v148) — PROPOSED, awaiting the owner

`db/dataset/misty-isles/architecture.js` writes the *MIG Security Architecture
Standard* into the library and answers each system's membership groups, through
the API as the CISO. It is idempotent and serves both a fresh build (after import)
and the live instances. **It has run only on a scratch copy of CIRKS-dev.**

**Library.** Six groups (Connectivity, Hosting, Operating system, Authentication
service, Support team, User group); 15 new organisation-wide components for the
answers that did not exist (the network zones, *Microsoft Azure UK South*, the
explicit SaaS answers, the four sign-in memberships, *Supplier support team*, *PAN-OS*,
*Members of the public*).
Rules:

| security solution | required where a system records any of |
|---|---|
| CrowdStrike EDR, Veeam backup | Windows Server 2016 / 2025, Windows 10 / 11, Ubuntu Server 24.04, AlmaLinux 9 (not Windows 7 — no agent, §6.2) |
| Wazuh agent (OT), Network isolation | any of the three OT networks |
| Syslog to Wazuh | Cisco IOS XE, PAN-OS |
| Configuration backup (network appliances) | Cisco IOS XE |
| Defender for Servers (Azure), Azure Backup | Microsoft Azure UK South |
| TLS | MIGNet (internal), MIGNet (DMZ), Azure cloud network |
| NIDS (Palo Alto ATP), Perimeter firewall and segmentation | MIGNet (internal), MIGNet (DMZ) |
| Active Directory (on-premises) / Entra ID (cloud) | Joined to MIG Active Directory / Entra ID sign-in |
| Remote-access VPN | Mobile locations |
| Provided by the supplier | Supplier-hosted (SaaS) |

Builds: MIG Windows server, MIG Linux server, MIG Azure server, Supplier SaaS.

**Answers come from the hosting class (§2)**: IT and infrastructure → MIGNet
(internal) and Active Directory; the VPN → MIGNet (DMZ); the remote desktop →
external internet; Azure → Azure cloud network, Azure UK South, Entra ID; SaaS →
external internet, supplier-hosted unless a hosting facility is already recorded,
supplier-managed OS, Entra ID for the Microsoft ones and supplier-managed sign-in
otherwise; OT → its site's OT network and local accounts. A supplier running a SaaS
or contracted-out OT is the support team.

**Where the story did not say, the answers are filled in** (owner, 2026-10-02:
*"fill in most of them, and deliberately leave two or three blank as teaching
examples"*) — `FILL` in the script: Debian 12 on the OT hosts, Windows Server 2016
on Criminal Records (CrowdStrike is taking over from OSSEC, §6), Windows 7 on the
Playbooks (no agent can run, §6.2), PAN-OS on the NIDS and the VPN, the CrowdStrike
console's own service on the HIDS, the obvious hosting, support teams and user groups.

**Left blank on purpose** — what an unfinished record looks like:

- *Driver and Vehicle Licensing System*: operating system, hosting, support team and
  user group — a system nobody finished recording;
- *Maritime and Aviation Radio Communications System*: operating system.

**Azure servers record their OS too**, so the CrowdStrike and Veeam rules apply to
them as well as Defender and Azure Backup. The architecture's answer is a
**choice**, recorded once per solution — Defender, Azure Backup — on Electoral Roll
and GIS Land Register. (This needed a fix in v148: a choice now settles every
objective its solution delivers, as decision 1 says.) *CrowdStrike host
containment* is not on the OS rule for the same reason: it would ask an Azure server
for a Falcon agent.

**Measured on the scratch copy:**

| | |
|---|---|
| answers recorded | 169, plus 4 choices |
| blank answers | 5, all deliberate (above) |
| a part the architecture needs, not recorded | 6 — the Wazuh agent on Aircraft fuelling and the radio system (true: §6), TLS on the Playbooks, MIG Backup and Defender for Cloud, the Falcon agent on Coastal Radar (it conflicts — below) |
| conflicts | Coastal Radar and Ship Tracking: Windows Server 2025 **and** the OT network, so CrowdStrike and Wazuh both apply (6 objectives) — the one open conflict, as §8 dragon 2 expects |
| objectives needing a solution chosen | 116 — a threat calls for them and no rule delivers them |
| wanted by a rule but no `system_controls` row | 242 before the script records them; 0 after (question 1) |

**Questions for the owner:**

1. ~~"Wanted but not recorded"~~ — **decided (owner, 2026-10-02): record them.** The
   script records every objective a wanted solution delivers that the system has no
   row for, with its status **derived** from how the system is delivered (complete →
   operational, degraded → degraded, otherwise missing) — never a default. On the
   scratch copy: **242 recorded — 178 operational, 10 degraded, 54 missing. No risk
   score moved (0 of 228)**: a control row lowers a score only once someone judges
   what it achieves against the risk, and none of these is judged; none of the 54
   missing rows touches a live risk. This needed a fix first (#183): recording an
   objective that has security solutions used to copy its whole library list onto the
   system as present.

   After it, the finding remains on 43 systems: 35 only because objectives need a
   security solution **chosen** (116 — a threat calls for them and no rule delivers
   them), 8 for the deliberate blanks, a missing part or the Coastal Radar conflict.
   Those choices are the Security tab's job (step 3).
2. ~~The blanks~~ — **decided (owner, 2026-10-02):** fill in most, leave two or three as
   teaching examples (above).
3. ~~OT networks~~ — **decided (owner, 2026-10-02): three** — *Power station OT
   network*, *Water works OT network*, *Airport and harbour OT network*.
