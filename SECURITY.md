<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright (C) 2026 Wightman Brown Limited -->

# Security policy

CIRKS holds an organisation's view of its own weaknesses, so we take reports of
vulnerabilities in it seriously, and we are grateful for them.

## Reporting a vulnerability

**Please do not report a vulnerability in a public issue, discussion or pull
request.** Report it privately, in either of these ways:

- **Preferred:** GitHub's private reporting. Go to the
  [Security tab](https://github.com/WightmanBrown/cirks/security) and choose
  **Report a vulnerability**.
- By email to <cirks@wightmanbrown.ltd.uk>, with "Security" in the subject.

Include what you found, the version of CIRKS, the steps to reproduce it, and
what an attacker could achieve with it. A proof of concept helps, but is not
required.

## What happens next

- We aim to acknowledge your report within **five working days**, and to tell
  you within **fifteen working days** whether we accept it and what we plan to
  do.
- We will keep you informed while we fix it, and agree a disclosure date with
  you. We normally ask for up to **90 days** before details are made public.
- When the fix is released, we credit you in the release notes and the
  security advisory, unless you would rather not be named.

## Supported versions

Security fixes are made to the **latest release**. Upgrade to it to receive
them; upgrades migrate your data in place, as described in the
[install guide](docs/INSTALL.md#upgrade).

## Scope

In scope: the CIRKS source code in this repository, and the container image and
configuration it ships with.

Out of scope: a CIRKS installation run by somebody else (report it to them),
vulnerabilities that need an attacker who already controls the server or its
Docker host, and reports from automated scanners with no demonstrated impact.

Please test only against an installation you own, such as a
[training instance](docs/INSTALL.md), never against someone else's.
