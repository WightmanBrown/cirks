# import/

Put the CSV files you want to load into CIRKS in this folder — for example the
sheets of `docs/templates/CIRKS-organisation-capture.xlsx`, each saved as
*CSV UTF-8* under the file name shown on the workbook's *Read me* sheet.

The app container sees this folder, read-only, as `/import`. Load it with:

```bash
docker compose exec app node riskapp/db/import.js /import --dry-run   # check first, writes nothing
docker compose exec app node riskapp/db/import.js /import --password '<starting password>'   # load
```

Files here are never committed (see `.gitignore`), and nothing in CIRKS writes
to this folder. Remove the files when you have finished — the users file can
hold initial passwords. See `docs/INSTALL.md`.
