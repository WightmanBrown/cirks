# CIRKS demo / training dataset — "Misty Isles Government"

> **Superseded (2026-10-15).** The training instance is now built by one command,
> `riskapp/db/dataset/misty-isles/install.js` — see `docs/INSTALL.md` Part 3A and
> `riskapp/db/dataset/misty-isles/README.md`. It asks for the administrator's
> password and leaves every other account locked. This older CSV set is kept for
> reference only.

A curated fictional organisation (**Misty Isles Government** — a maritime/coastal
theme: coast guard, fisheries, utilities), loaded into a **fresh** CIRKS install
to give a populated training system.

**Status (2026-07-24): COMPLETE.** All content datasets are authored and
validated — the full set was assembled in a running instance and exported via
**Admin → Data Export**, then confirmed to re-import into a freshly
migrated + seeded database with **0 errors** (1,318 rows: 12 departments, 17
users, 39 systems, 95 services, 144 components, 20 threats, and the threat→control
+ component→control crosswalks). **Training only** — shared demo password, not for
production; load into a single-instance stack's own database (never a production
DB).

Controls, RBAC (capabilities/role_permissions) and the standards catalogue are
**not** in these files — `db/seed.js` seeds them (incl. the 106 NIST CSF 2.0
controls) before this content loads, so `control-threats.csv` and
`control-component-links.csv` resolve against the seeded control titles.

These CSVs build the **static architecture**. The operational/governance layer
(risks, validations, actions, exceptions, SWG meetings, minutes) is generated
afterwards by a scripted ISMS cycle that drives the real API routes, so that data
is internally consistent (correct derived scores + audit trail + minutes).

## Load order

Files are loaded in this exact dependency order (each references only rows above
it). RBAC (capabilities / role_permissions) is **not** here — it is canonical
reference data seeded by `db/seed.js`.

| # | File | References |
|---|------|-----------|
| 1 | `departments.csv` | (owner_email → users, resolved after users load) |
| 2 | `users.csv` | departments |
| 3 | `user_roles.csv` | users (additional roles; primary role is in `users.csv`) |
| 4 | `impact-tables.csv` | departments |
| 5 | `impact-table-bil-levels.csv` | impact-tables |
| 6 | `impact-table-cia-levels.csv` | impact-tables |
| 7 | `threats.csv` | — |
| 8 | `controls.csv` | — (optional — 106 NIST CSF controls are pre-seeded) |
| 9 | `control-threats.csv` | controls, threats |
| 10 | `control-mappings.csv` | controls, standard reference catalogue |
| 11 | `components.csv` | (created_by_email → users, optional) |
| 12 | `component-relationships.csv` | components |
| 13 | `control-component-links.csv` | controls, components |
| 14 | `information-assets.csv` | departments, users |
| 15 | `asset-impact-ratings.csv` | information-assets, impact-tables |
| 16 | `systems.csv` | departments, users |
| 17 | `system-assets.csv` | systems, information-assets |
| 18 | `system-components.csv` | systems, components |
| 19 | `business-services.csv` | departments, users |
| 20 | `business-service-assets.csv` | business-services, information-assets |

## Conventions & gotchas

- **Departments first, but department owners are backfilled.** A department names
  an `owner_email` while every user names a department — a cycle. Put `owner_email`
  in `departments.csv`; the importer resolves it after `users.csv` loads.
- **`users.csv` / `user_roles.csv` are loaded by the import runner.** `password`
  blank → the importer applies the starting password given (`--password <pw>` /
  `DEMO_PASSWORD` env; there is no default), bcrypt-hashed; a per-row `password`
  overrides it. `role` blank → DB default (`information_asset_owner`). `view_mode`
  blank → `business` (per-user default display; `business` = words, `expert` =
  numbers — presentation only, switchable per session). `user_roles.csv` grants
  ADDITIONAL roles beyond the primary role in `users.csv`. Roles must be values of
  the `user_role` enum: `admin, ciso, risk_analyst, information_asset_manager,
  information_asset_owner, security_consultant, siro, meeting_secretary,
  soc_analyst`.
- **Department owners are back-filled.** A department's `owner_email` may name a
  user defined later in `users.csv`; the runner resolves it after users load
  (breaking the departments↔users FK cycle), so you can reference any user freely.
- **Rate assets, then link them.** Asset CIA (from `asset-impact-ratings.csv`) is
  the single source of truth; systems/services derive their C/I/A as the MAX over
  linked assets automatically. There is no system/service CIA column — do not try
  to set one.
- **Controls are optional.** The 106 NIST CSF 2.0 controls ship pre-seeded. Author
  `controls.csv` only for custom teaching examples; they sit alongside NIST.
- **Two buckets for teaching examples.** Architecture-level issues (mis-rated
  asset, cross-department shared system, ownerless service, unmapped control) go in
  these CSVs. Governance-level issues (risk stuck under review, overdue action,
  expired exception, risk accepted above appetite) go in the Phase-3 ISMS cycle.
- Idempotent: a row whose business key already exists is skipped. Validate with
  `node db/import.js seed-data/demo --dry-run` before a real load.

## The risk surface — `system-threats.csv` + `system-controls.csv`

These two files are what makes the org *raisable against*: a risk is a system ×
threat pair, and the controls treating it are `system_controls ∩ control_threats`.
Without them a load produces a complete architecture that cannot generate a single
risk. How the Misty Isles pair was authored, so it can be extended coherently:

- **Threat exposure is hand-authored per system** (~5–7 threats each, 222 rows),
  chosen from the system's actual nature rather than applied uniformly — OT and
  safety-critical systems carry `Hardware or software failure`, `Natural disaster`
  and `Physical intrusion`; public-facing systems carry `Exploitation of a
  public-facing application`; record systems carry `Accidental data disclosure`,
  `Data exfiltration` and `Malicious insider misuse`.
- **Control deployment is DERIVED from that exposure**, not authored separately:
  each system gets the union of controls the `control-threats.csv` crosswalk
  links to its threats (~21 controls each, 823 rows). Deriving rather than
  hand-listing means the deployment and the exposure can never disagree, and every
  system × threat pair is guaranteed at least one treating control — so no risk
  ever opens onto an empty coverage panel.
- **`status` is the gap signal and carries the teaching.** The mix is ~60%
  `operational` / 20% `degraded` / 13% `unknown` / 7% `missing`, weighted by a
  per-system security posture: the corporate IT and security estates are strong,
  health and justice are mixed, utilities/airport/maritime OT are weak, and the
  outsourced billing platform is mostly `unknown` (you cannot see what your
  supplier does). A dozen rows carry explicit storyline gaps with an explanatory
  `notes` value — unencrypted pupil records, no tested restore for the turbine
  historian, a flat corporate/SCADA network, a supplier onboarded before the
  assurance process existed.
- **A blank `status` is not neutral** — it imports as `unknown`, which the
  gap-driven action builder offers as an untreated gap. Set it deliberately.
- **Five pairs are deliberately UNTREATED** (every control treating that threat
  is `missing` on that system): Power Generation × Ransomware, Pupil/student
  records × Unauthorised data modification, Approach radar × DoS, Billing and
  meter reading × Supply chain compromise, Costal Radar × Hardware failure. This
  is load-bearing, not decoration. Residual probability is a **MIN over the
  DEPLOYED (operational|degraded) controls** — the *best* deployed control
  governs and missing/unknown ones are ignored — so a pair only sits at the
  threat's inherent likelihood, and so only reaches the top of the scale, when it
  has no working control at all. Without these the entire portfolio floors at
  inherent−2 and nothing ever scores above 15.

## The operational tier — `db/isms-cycle.js`

Risks, actions, exceptions and meetings are **not** CSV-loadable: they come out of
stored functions, triggers and multi-step state machines, so hand-written rows
would carry inconsistent derived scores and no audit trail. `node db/isms-cycle.js`
instead drives the real HTTP API as each persona — analyst raises and judges,
CISO validates and accepts, actions are built from the coverage gap and
progressed, the secretary runs and minutes an SWG meeting. Run it after the CSVs
are loaded. `--dry-run` reports the plan; `--reset` clears what it previously
created. See the header of that file for the caveats.
