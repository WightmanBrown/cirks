# Bundled standard reference catalogues

CSV reference catalogues for the per-standard Statement of Applicability (the "audit
subset" views). Each row is one reference control in a standard; import via
**Setup → Control Sets → Upload catalogue (CSV)** (`POST /standards/:id/controls/import`).

Columns: `ref_code, title, description, grouping, implementation_group`.

## Licensing
Only **licence-clean** catalogues are bundled here:

| File | Source | Licence |
|---|---|---|
| `nist_csf_2.0_reference.csv` | NIST Cybersecurity Framework 2.0 Core (NIST CPRT export) | **Public domain** (US Government work) |

- **CIS Controls v8** is **not** bundled — it is CC BY-NC-SA (incompatible with this
  project's Apache-2.0 licence, and whose non-commercial term rules out redistribution here). Import your own copy under your CIS licence.
- **ISO/IEC 27001 Annex A** text is copyrighted; CIRKS ships only original paraphrases.

## test/: a fictional standard for testing
`test/` holds the **Test Payment Security Standard** (`tpss_test`). It is invented,
not PCI-DSS, and exists to test the SoA with two overlapping standards loaded. See
`test/README.md` for the load order.

## nist_csf_2.0_reference.csv
The 106 CSF 2.0 Subcategories (the canonical core), `grouping` = Category name,
`title` = the verbatim Subcategory outcome statement. Sourced from the official NIST
CPRT machine-readable export (https://csrc.nist.gov/projects/cprt), deduped to active
subcategories (1.1→2.0 "withdrawn" relocation entries removed). 6 Functions /
22 Categories / 106 Subcategories.
