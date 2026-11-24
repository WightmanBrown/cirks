<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# Misty Isles — control effectiveness ratings (owner, 2026-11-23)

Only 49 of the 154 applicable objectives (32%) carried an effectiveness rating;
105 read *Not assessed*. The owner asked for about 95%, and for the existing
ratings to be corrected where they contradicted the record. Each rating is
derived from what the dataset already says, with a first-person evidence note,
in `riskapp/db/dataset/misty-isles/baseline/controls.csv` (the OT objective in
`build.js`).

## The rule

| Evidence | Rating |
|---|---|
| Recorded system by system: working on ≥ 90% of its systems | 4 (new) — at most 5 (existing) |
| … 80–90% | 3 (new) — at most 4 |
| … 70–80% | 3 — at most 3 |
| … under 70% (degraded and missing count against it) | 2 — at most 2 |
| Not per system (or delivered once): SoA *implemented* | 3 |
| SoA *partial* | 2 — at most 3 |
| SoA *planned* or *not implemented* | 1 — at most 1 |

An objective delivered once for the organisation or for a group carries the SoA's
status onto every system, so its systems are not evidence of their own; the SoA
decides. Where an objective is recorded system by system, the systems are the
stronger evidence (a status follows its solution's parts, v152), and the SoA is
left as it is.

Existing ratings were only ever pulled **down** to the cap, never up; each
corrected note keeps its words and adds *"Revised from N to M in the 2026 review:
<reason>"*.

**Left unrated** (the newest areas, nobody has assessed them yet): AI-02, AI-03,
AI-07, CS-10, CS-11, DCH-09, DM-10.

## Result

147 of 154 applicable objectives rated (95.5%): 98 new, 16 corrected.

| 1 Initial | 2 Repeatable | 3 Defined | 4 Managed | 5 Optimising | Not rated |
|---|---|---|---|---|---|
| 21 | 45 | 67 | 7 | 7 | 7 |

No risk score changes (effectiveness informs a judgement; it does not compute
one): 69 of 227 risks at or above 12, as before.

## The SoA understated one objective — corrected

SCM-08 *Trusted products*: its delivery is not stated, so its implementation
status is typed by hand, and it said *not implemented* while the objective is
working on 12 of the 15 systems it applies to. Set to **partial** with that
description (owner, 2026-11-23), in `baseline/soa-entries.csv` and on CIRKS-dev.

Two others looked the same and were not: SVM-06 *Software installation is
controlled* and BRR-06 *Continuity and recovery plans* are delivered on each
system, so the SoA works their status out from the systems (v129) and already
shows **partial**; the stored value it ignores said not implemented / planned.
The ratings used the systems for both, so none changes.

## Policies are delivered once for the organisation (owner, 2026-11-23)

The owner: most policies should be organisation-wide, and the obvious, simple
ones implemented. Of the 16 objectives that are policies:

- **Already organisation-wide:** access control, acceptable use, third party
  information risk.
- **Set to organisation-wide** (their delivery was not stated; each is a
  document, not something a system has): backup, network security, data
  classification, data handling, encryption, monitoring, logging, vulnerability
  management, AI use.
- **Left on each system**, because they are the enforcement of a policy on each
  system, with system records and judged likelihoods resting on them: network
  policy enforcement (firewalls), device hardening, identity management, secure
  development.

**Set to implemented:** AI use policy and third party information risk policy.
The SoA said *planned*, but the AI Usage Policy and the Supply Chain Security
Policy are both published and in force. Their effectiveness goes from 1 to 3 by
the rule above. Every other policy was already *implemented*.

On CIRKS-dev the nine now count on all 58 systems (522 rows of the derived
presence view), and **no risk score changes**: backup and logging counter
threats, but no likelihood has been judged against them. Still 69 of 227 at or
above 12.

## Delivery stated for 63 more objectives (owner, 2026-11-23)

Of the 86 objectives whose delivery was not stated, the owner agreed:

- **Organisation-wide (63):** processes, people, governance and central
  services, with nothing to record on a system; none was recorded on a system
  or carried a judged likelihood. The SoA keeps its stated status, and no risk
  score changes. Access control policy, set organisation-wide on CIRKS-dev by the
  owner the same afternoon, is included.
- **Left not stated for now:** four already recorded on systems (malware
  protection, configuration monitoring, zoning and segregation, trusted
  products), whose effect on the scores is to be measured first (trusted
  products has no security solution yet, so it would read missing on all 15);
  fourteen that belong on each system but are recorded on none (an objective
  delivered on each system and recorded on none reads *not implemented* in the
  SoA); and five ruled not applicable.

After this the dataset and CIRKS-dev agree on every objective's delivery.

Then (owner, the same day) the three already recorded on systems that have a
security solution: **malware protection, configuration monitoring, zoning and
segregation are delivered on each system.** Measured first on a copy of
CIRKS-dev, then applied: no risk score changes; their status on each system now
follows their solution (zoning becomes recorded, operational, on the Prison
Management System, where its solution is complete); the SoA works their status
out from the systems — all three **partial** (malware protection was stated
*implemented*, but it is missing or degraded on 15 of its 45 systems). Trusted
products waits for its solution.

## Three more rated by the owner (2026-11-23)

DNSSEC (CS-10), DDoS protection (CS-11) and application logging (DM-10) were
left unrated as not implemented. The owner confirmed they are in place
(#339 sets the SoA to implemented, with what delivers each) and rated them
himself: **5, 3 and 5**. Applied on CIRKS-dev with the SoA statuses, so the two
agree. Rated now: 150 of 154 applicable objectives (97.4%); unrated: AI-02,
AI-03, AI-07 and data leakage prevention (DCH-09, accepted in #339).
