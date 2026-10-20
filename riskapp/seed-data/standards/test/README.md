# Test Payment Security Standard (TPSS): a fictional standard for testing

**This is not PCI-DSS and is not derived from its text.** It is a small invented
standard, written for CIRKS, shaped like a payment-card standard. Its purpose is
to exercise the Statement of Applicability with **two overlapping standards
loaded**, the case described in
`docs/statement-of-applicability.md`.
It is original work under the project's licence. PCI-DSS itself cannot be
bundled (see `../README.md`).

Standard code: **`tpss_test`**.

## What it exercises

| Case | Where |
|---|---|
| One requirement met by several controls | 1.2, 2.1, 3.2 (three controls), 4.1, 5.1 |
| One control meeting several requirements | the access-permissions control → 3.1 (full) and 3.2 (partial) |
| A requirement met only partially | 1.1 and 5.1, both mapped `partial` only |
| A requirement with no control at all (a gap) | **2.3** (retention), deliberately unmapped |
| A standard contributing controls of its own | 3 new controls: tokenisation, key management, admin MFA |
| Overlap with the loaded NIST CSF | 11 of the 14 mapped controls are existing NIST CSF controls |

## Loading it: the files are numbered in load order

0. **Register the standard.** No API or screen creates a standard (a finding in
   its own right), so this one step is SQL:

   ```sql
   INSERT INTO standards (code, name, version, publisher, description, license, is_enabled, bundled, sort_index)
   VALUES ('tpss_test', 'Test Payment Security Standard', '0.1', 'CIRKS (fictional)',
           'Invented standard for testing multi-standard SoA behaviour. Not PCI-DSS.',
           'Apache-2.0 (CIRKS test data)', TRUE, FALSE, 90)
   ON CONFLICT (code) DO NOTHING;
   ```

1. `tpss_1_controls.csv`: **Control Library → Import** (admin). Adds the 3 new
   native controls. It is idempotent on title.
2. `tpss_2_reference.csv`: **Setup → Control Sets →** the *Test Payment Security
   Standard* card **→ Upload catalogue**. Adds 12 requirements in 5 groups.
3. `tpss_3_mappings.csv`: **Setup → Control Sets → Import mappings**. Adds 17
   mappings. Each row resolves by exact control title, so step 1 must come first.

## Expected result

- 12 requirements. 11 are mapped: 5 have full coverage and 6 are partial or
  mixed. 2.3 is unmapped.
- The 3 new controls have no `soa_entries` row, so they read as **not
  applicable** until someone decides otherwise.

## Removing it

```sql
DELETE FROM standards WHERE code = 'tpss_test';   -- cascades requirements, mappings, standard_soa_entries
DELETE FROM controls WHERE title IN (
  'Stored card numbers are tokenised or truncated',
  'Cryptographic keys are generated, stored, rotated and destroyed under a documented procedure',
  'Multi-factor authentication is enforced for administrative access');
```

The first statement cascades to `standard_controls`, then to `control_mappings`
and `standard_soa_entries`. It only nulls `origin_standard_id` on `controls` and
`threats` (checked 2026-09-21). Delete the three controls only if nobody has
deployed them on a system since.
