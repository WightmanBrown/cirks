<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# The CIRKS starter library

What a new organisation would otherwise have to write before CIRKS can do
anything for it. The files are in `db/import.js` format, so they load two ways:

- **A new installation** gets them by itself: the threats and their links on
  first start (`db/seed.js`, with the CIRKS objectives), the documents when the
  first administrator is created (`db/create-admin.js`). See
  `db/seed/starterLibrary.js`.
- **An existing installation** loads them with the importer; anything already
  there is skipped: `node db/import.js db/seed/starter`.

| File | What it is |
|---|---|
| `threats.csv` | 20 common threats — the Misty Isles training dataset's, with their starting likelihoods and where each comes from |
| `control-threats.csv` | 157 links from those threats to the CIRKS control objectives that counter them |
| `components.csv` | 25 policies, standards and procedures, **not published**, organisational |
| `control-component-links.csv` | The objectives each of those documents supports |

The threats and links must stay the same as Misty Isles'
(`db/dataset/misty-isles/baseline/`): a training install finds them already
loaded and keeps them. `src/__tests__/starterLibrary.test.js` checks that, and
that every link names an objective and a row that exist.

The starter impact tables and template groups are created on demand from the
screens; their content is in `src/routes/bil/starterTables.js` and
`src/routes/architecture/index.js`. See *The CIRKS starter library* in
`docs/deployment.md`.
