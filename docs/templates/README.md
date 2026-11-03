# Organisation capture workbook

For capturing an organisation in a spreadsheet before it is loaded into CIRKS.
All the files are in this folder; on GitHub, open one and use the download
button. Threats are not captured here: CIRKS comes with a starter set (see
*Threats* below).

| File | What it is |
|---|---|
| [`CIRKS-organisation-capture.xlsx`](CIRKS-organisation-capture.xlsx) | The blank workbook to hand to whoever is gathering the information |
| [`CIRKS-organisation-capture-EXAMPLE.xlsx`](CIRKS-organisation-capture-EXAMPLE.xlsx) | The same workbook filled in for a small invented organisation. It loads as it is |
| [`build-capture-workbook.cjs`](build-capture-workbook.cjs) | Rebuilds both workbooks. Needs `exceljs`, which is not an application dependency (see the file's header) |

## The sheets

One sheet per file that `riskapp/db/import.js` loads, numbered in load order.
Row 1 of each is the importer's own column names.

| # | Sheet | Saved as |
|---|---|---|
| 1 | Departments | `departments.csv` |
| 2 | Users | `users.csv` |
| 3 | Additional roles | `user_roles.csv` |
| 4 | Impact tables | `impact-tables.csv` |
| 5 | Impact levels | `impact-table-bil-levels.csv` |
| 6 | Impact levels by CIA | `impact-table-cia-levels.csv` |
| 7 | Information assets | `information-assets.csv` |
| 8 | Asset ratings | `asset-impact-ratings.csv` |
| 9 | Systems | `systems.csv` |
| 10 | System assets | `system-assets.csv` |
| 11 | Business services | `business-services.csv` |
| 12 | Service systems | `business-service-systems.csv` |

Plus **Read me** (how to fill it in, save and load) and **Roles** (reference:
the role keys and what each is for; not loaded).

## Threats

A new installation of CIRKS comes with 20 common threats, each linked to the
control objectives that counter it, so there is no threat sheet to fill in. Each
threat's likelihood is CIRKS's starting estimate, with a note saying where it
comes from: review them for your organisation (**Risk Management → Threats**)
before you assess risks. An installation from before they shipped can load them,
with the other starter items, as described in *The CIRKS starter library* in
[`../deployment.md`](../deployment.md).

## Loading

There is no upload screen for these in the application: the files are loaded by
the import command on the server. See *Load organisation data from
spreadsheets* in [`../deployment.md`](../deployment.md).

```bash
node db/import.js <folder> --dry-run            # check, change nothing
node db/import.js <folder>                      # load; every new account starts with sign-in locked
```

## Keeping it in step with the importer

The column names are written out in `build-capture-workbook.cjs`. When a column
is added to one of these datasets in `riskapp/db/import.js`, add it there and
rebuild. `organisationCapture.integration.test.js` loads files of this shape
through the real importer, one at a time, as written by Excel.
