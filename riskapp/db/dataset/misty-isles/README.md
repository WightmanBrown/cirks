# Misty Isles — the training dataset

The Misty Isles Government (MIG) is CIRKS's training and demonstration organisation.
Its estate is described as a story in
[`docs/dataset/misty-isles-architecture.md`](../../../../docs/dataset/misty-isles-architecture.md),
agreed with the owner on 2026-09-30. This directory turns the story into data.

| Path | What it is |
|---|---|
| `baseline/` | CIRKS-test exported on 2026-09-30: everything the owner curated (departments, people, systems, assets, services and their links, threats, the SoA). Kept as the starting point. |
| `build.js` | The story as data (hosting classes, security services, delivery patterns, the deliberate problems, suppliers), applied to `baseline/`. |
| `data/` | The result: the architecture tier, ready to import. **Generated — change `build.js`, not these files.** |

## Build an instance

**In one command** (the usual way — inside the app container of a fresh install,
see `docs/INSTALL.md`):

```bash
docker compose exec app node riskapp/db/dataset/misty-isles/install.js
```

`install.js` asks for the administrator's password (no default), runs every step
below in order, refuses a database that already has departments, and stops at
the first failure. Last, it locks every account except the administrator
(`A.James@mig.local`): each keeps working as an owner but gets a random password
nobody knows, until the administrator sets one. The steps, by hand — these leave
every account on the password you give, so prefer `install.js`:

```bash
cd riskapp
node db/dataset/misty-isles/build.js          # baseline/ + story → data/  (dates relative to today)
# into an EMPTY database:
node db/migrate.js up
node db/seed.js
node db/import.js db/dataset/misty-isles/data --password '<password>'
```

Then the operational tier, through the real API as each persona. Start the API
against the new database first (`npm start`, or the container), set
`CIRKS_PASSWORD='<password>'` (the scripts sign in with it), then:

```bash
node db/dataset/misty-isles/architecture.js --base <api>  # the security architecture (v148) and each system's answers
node db/dataset/misty-isles/objective-solutions.js --base <api>  # a security solution for every objective that needs one (v153)
node db/isms-cycle.js --base <api>                    # a first risk portfolio, actions, exceptions, one SWG meeting
node db/isms-cycle.js --base <api> --assess-backlog   # assess the rest (four systems held back, deliberately)
node db/dataset/misty-isles/story-cycle.js --base <api>   # the story's problems bite; a backlog; a year of history
```

`architecture.js` is idempotent and also brings an existing instance up to date.

`story-cycle.js` does everything a user can do through the API as the persona who
would do it. Two things have no API and are written directly, each marked `SQL`
in the code: review cycles (nothing creates them yet — the ISO audit-pack work on
the roadmap), and moving history back to the dates it happened.

**Accounts:** the export never contains passwords. After `install.js` only the
administrator can sign in, with the password typed at the start; set any other
account's password on Admin → Account Management (or `node db/reset-password.js`).

**The order matters.** The estate is settled (the architecture and the
security solutions) before any risk is assessed, because each control is judged
from its status at that moment. Assessed first and settled after, 24 risks were
left scored against statuses that had since changed (fixed 2026-10-28).

What a build produces (checked 2026-10-28 with `install.js`, schema 0163): 12
departments, 31 people, 52 systems, 227 risks (69 at or above the
mandatory-action score of 12), all from the story's deliberate problems; a
validation backlog; 8 security actions — 3 awaiting acceptance, 3 under way on
the story's own problems, 2 finished — and no work ever lands on a deliberately
degraded part, so every problem in §6 of the sheet is still there; 5 exceptions, one lapsed into the breach queue;
four quarterly review cycles, three closed and signed off, each with a minuted SWG
meeting.

## The story is checked on every change

The application changes independently of this dataset, and a change can stop the
story being true without breaking any test. On 2026-10-28 the install was found
to mend Approach radar's out-of-date Wazuh agents in every build, a problem the
walkthrough asks people to find.

So what a build promises is written down in `story-promises.js`: the counts
above, every deliberately degraded part, and the facts the walkthrough's
exercises depend on. The CI job **Misty Isles story check** builds the dataset
with the real `install.js` and runs `story-check.js` against it, for every pull
request that touches `riskapp/`. Run it yourself against any freshly built
instance:

```bash
node db/dataset/misty-isles/story-check.js
```

**When it fails**, the application's own tests may all be green: this check is
about the story. Decide consciously. Either the change broke the story (fix
the change), or the story has legitimately changed (update `story-promises.js`
and the documents that quote it, `docs/INSTALL.md`, the top-level `README.md`
and `docs/dataset/misty-isles-walkthrough.md`, in the same pull request).

## What the story guarantees

- Every system has a hosting class (IT on-premises, Azure, SaaS, OT,
  infrastructure), and its components follow from it.
- A control's status on a system is **derived from its delivery patterns**
  (v145): complete → operational, degraded → degraded, otherwise missing.
- Every degraded state sits on a **named part, with a reason**. The deliberate
  problems are listed in §6 of the sheet and `DEGRADED_PARTS` in `build.js`.
- Supplier evidence dates are relative to the day `build.js` runs, so a rebuild
  is never stale.
- Real vendors appear only as products. Anything that goes wrong sits on a
  fictional supplier.
