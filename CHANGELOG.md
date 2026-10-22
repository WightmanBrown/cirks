<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# Changelog

Every release of CIRKS, newest first. Versions follow
[semantic versioning](https://semver.org/): a change in the first number may
need you to act when you upgrade, and the release notes say what.

Upgrading migrates your data in place, and CIRKS backs up the database before
it changes anything. See [Upgrade](docs/INSTALL.md#upgrade) in the install
guide.

## v1.0.2

Fixes from the first external tester's install, and a dependency update. No
schema change.

- **One password rule everywhere: at least 12 characters, at most 72 bytes.**
  The command-line tools already asked for 12, but *Account Management* and the
  admin API accepted 8, and the importer checked nothing. A password over 72
  bytes is now refused: bcrypt ignores everything after the first 72 bytes, so
  until now the API accepted up to 128 characters and anything past the 72nd
  byte made no difference. Accented and other non-English letters count as two
  bytes or more. Passwords already set keep working until they are next
  changed.
- **Install guide:**
  - 1.1 checks for Docker installed as a snap, which stops the application
    container starting (`exec /usr/local/bin/cirks-entrypoint: operation not
    permitted`), and says how to swap it for the apt package. The troubleshooting
    table names the error. curl comes from apt too.
  - 2.1 makes the secrets only once. Running it again used to replace `.env` and
    its secrets, and on a CIRKS that has started the new database password no
    longer matches the database.
  - The hosts-file and `COMPOSE_FILE` lines are no longer added twice when a
    block is run again.
  - A copy of `.env` is saved after 2.3, once the file is complete, not in 2.1.
  - A training VM can use its own browser; the certificate steps cover Firefox.
  - 3B.1 states the password rule, and the 3B.4 dry run takes the real starting
    password.
  - Ubuntu 26.04 LTS on x86_64 is listed among the tested installs.
- **Dependency update:** the frontend's `follow-redirects` 1.16.1, for
  GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c (credential headers kept across a
  cross-origin redirect). axios uses it only under Node.js, not in the browser,
  so CIRKS was not exposed; the update keeps the dependency audit clean.

Thanks to the first external tester for a careful install report.

## v1.0.1

- The CIRKS logo on the sign-in screen, in the README and as the browser-tab
  icon, recoloured to match CIRKS's dark theme.
- The documentation site's home page links to every guide again.

## v1.0.0

The first public release.

**Risk derived from what you record, not typed in as opinion**

- **Impact** comes from information assets, rated against your impact tables.
  A system's impact is the highest of the assets it holds, and a business
  service's follows from its systems.
- **Probability** comes from the controls that counter each threat on each
  system, using only the controls actually in place there.
- **Target risk** is derived from the security actions you have committed to,
  not set by hand.

**Security architecture and controls**

- A control objective's status on a system follows the security solution that
  delivers it: when the solution's parts are working, the objective is met.
- Systems architecture template, security pattern triggers and system
  architecture patterns, so that a new system starts with the security it
  should have.
- Statement of Applicability, with scopes, findings and approved, frozen
  versions. The NIST CSF 2.0 catalogue is included. Organisations can load
  their own licensed copy of other standards.

**Governance**

- Validation of risks by the CISO, security actions built from the gap,
  time-limited risk exceptions, and assurance findings that can be acted on or
  accepted.
- Security Working Group meetings: agenda, attendance, decisions, and minutes
  that cannot be changed once issued.
- Suppliers, their relationships and assurance evidence.
- Role-based access with department scoping, and an audit trail.

**Installing and running**

- Docker install with HTTPS, guided step by step from an empty Ubuntu machine.
- Misty Isles Government, a fictional organisation with a year of risk
  management, for training and demonstrations.
- An organisation capture workbook for loading your own organisation.
- Backup and restore onto a wiped machine, documented and tested.
