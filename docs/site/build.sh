#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Wightman Brown Limited
# Assemble the public documentation site (GitHub Pages) into a directory.
#
#   docs/site/build.sh <out-dir>
#
# ONLY the files listed in PUBLISHED are copied — the site is an allow-list.
# docs/ also holds design notes, the roadmap and the hardening backlog, which
# are not for publication (owner, 2026-10-15: "user guides only"); adding a file
# to docs/ never publishes it. Add it here, deliberately, to publish it.
#
# A link from a published page to an unpublished one is turned into plain text,
# so the site never links to a page that is not there.
set -euo pipefail
OUT="${1:?usage: docs/site/build.sh <out-dir>}"
DOCS="$(cd "$(dirname "$0")/.." && pwd)"

PUBLISHED=(
  INSTALL.md
  deployment.md
  modelling-sequence.md
  modelling-patterns.md
  terminology.md
  dataset/misty-isles-architecture.md
  templates/README.md
  templates/CIRKS-organisation-capture.xlsx
  templates/CIRKS-organisation-capture-EXAMPLE.xlsx
  templates/starter-threats.csv
)

rm -rf "$OUT"; mkdir -p "$OUT"
cp "$DOCS/site/_config.yml" "$DOCS/site/index.md" "$OUT/"
for f in "${PUBLISHED[@]}"; do
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$DOCS/$f" "$OUT/$f"
done

python3 - "$OUT" "${PUBLISHED[@]}" <<'PY'
import os, re, sys
out, published = sys.argv[1], set(sys.argv[2:]) | {'index.md'}
link = re.compile(r'\[([^\]]+)\]\((?!https?://|#|mailto:)([^)#\s]+)(#[^)]*)?\)')
for f in [p for p in published if p.endswith('.md')]:
    path = os.path.join(out, f)
    text = open(path, encoding='utf-8').read()
    def fix(m):
        target = os.path.normpath(os.path.join(os.path.dirname(f), m.group(2)))
        return m.group(0) if target in published else m.group(1)
    new = link.sub(fix, text)
    if new != text:
        open(path, 'w', encoding='utf-8').write(new)
        print(f'[site] {f}: links to unpublished pages made plain text')
PY
echo "[site] assembled ${#PUBLISHED[@]} files into $OUT"
