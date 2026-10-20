<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# Changelog

Every release of CIRKS, newest first. Versions follow
[semantic versioning](https://semver.org/): a change in the first number may
need you to act when you upgrade, and the release notes say what.

Upgrading migrates your data in place, and CIRKS backs up the database before
it changes anything. See [Upgrade](docs/INSTALL.md#upgrade) in the install
guide.

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
