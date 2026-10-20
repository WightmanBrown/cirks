# CIRKS documentation

**CIRKS** (Cheltenham Information Risk Knowledge System) is an open-source,
ISO 27001-aligned tool for modelling information risk, to support better
security and cost decisions. Risk is derived from what an organisation already
records — its information assets, systems and controls — rather than typed in as
opinion.

## Install

- **[Installing CIRKS](INSTALL.md)** — from an empty Ubuntu machine to a working
  CIRKS, as either a **training instance** loaded with the fictional *Misty Isles
  Government*, or an **empty instance for your organisation**.
- **[Running CIRKS](deployment.md)** — upgrades, backups and restore, TLS
  options, air-gapped installs, secrets.

## Load your organisation

- **[The organisation capture workbook](templates/README.md)** — one sheet per
  kind of record, in load order:
  [blank workbook](templates/CIRKS-organisation-capture.xlsx) ·
  [worked example](templates/CIRKS-organisation-capture-EXAMPLE.xlsx) ·
  [starter threat catalogue](templates/starter-threats.csv).

## Model it well

- **[The modelling sequence](modelling-sequence.md)** — the order in which an
  organisation is modelled: interview top down, enter bottom up.
- **[Modelling patterns](modelling-patterns.md)** — scenarios that are easy to
  get wrong, and how to record them. Starts from the golden rule: *only model
  things that help answer a security question.*
- **[Terminology](terminology.md)** — the words CIRKS uses strictly: control
  objective, control, standard requirement.
- **[The Misty Isles story](dataset/misty-isles-architecture.md)** — the estate
  behind the training dataset.

---

© 2026 Wightman Brown Limited. CIRKS is open source under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
"CIRKS" and "Cheltenham Information Risk Knowledge System" are trademarks of
Wightman Brown Limited.
