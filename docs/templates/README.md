# Organisation capture workbook and starter threats

For capturing an organisation in a spreadsheet before it is loaded into CIRKS,
and a starting threat catalogue to load with it. All the files are in this
folder; on GitHub, open one and use the download button.

| File | What it is |
|---|---|
| [`CIRKS-organisation-capture.xlsx`](CIRKS-organisation-capture.xlsx) | The blank workbook to hand to whoever is gathering the information |
| [`CIRKS-organisation-capture-EXAMPLE.xlsx`](CIRKS-organisation-capture-EXAMPLE.xlsx) | The same workbook filled in for a small invented organisation. It loads as it is |
| [`starter-threats.csv`](starter-threats.csv) | 20 common threats, ready to load as `threats.csv`. Not part of the workbook (see below) |
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

## Starter threats

CIRKS comes with no threats, and without them no risk can be recorded.
`starter-threats.csv` is a starting set of 20, in the importer's own columns, to
copy into the import folder beside the workbook's files:

```bash
cp ~/cirks/docs/templates/starter-threats.csv ~/cirks/import/threats.csv
```

Each threat starts with a likelihood of 3 (*Annual*) for confidentiality,
integrity and availability. That is a placeholder, not an assessment: set each
one for your organisation (**Risk Management → Threats**) before you assess
risks. See *Add a threat catalogue* in [`../INSTALL.md`](../INSTALL.md).

## Loading

There is no upload screen for these in the application: the files are loaded by
the import command on the server. See *Load organisation data from
spreadsheets* in [`../deployment.md`](../deployment.md).

```bash
node db/import.js <folder> --dry-run            # check, change nothing
node db/import.js <folder> --password <pw>      # load; <pw> is the new accounts' starting password (required: no default)
```

## Keeping it in step with the importer

The column names are written out in `build-capture-workbook.cjs`. When a column
is added to one of these datasets in `riskapp/db/import.js`, add it there and
rebuild. `organisationCapture.integration.test.js` loads files of this shape
through the real importer, one at a time, as written by Excel.
