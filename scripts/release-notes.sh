#!/usr/bin/env bash
#
# Assemble a release's notes from CHANGELOG.md.
#
# Usage:
#   scripts/release-notes.sh <version>     e.g. scripts/release-notes.sh 2.4.2
#   scripts/release-notes.sh Unreleased    the pending, not-yet-released section
#
# Prints the CHANGELOG section for that version (everything between its
# "## [version]" heading and the next "## [" heading) to stdout, ready to feed a
# GitHub release:
#
#   gh release create v2.4.2 --notes-file <(scripts/release-notes.sh 2.4.2) <artifacts...>
#
# Release flow: keep entries under "## [Unreleased]" as you work. At release
# time, rename that heading to "## [X.Y.Z] - <date>", add a fresh empty
# "## [Unreleased]" above it, then run this with the new version.
set -euo pipefail
ver="${1:?usage: scripts/release-notes.sh <version|Unreleased>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(awk -v ver="$ver" '
  $0 ~ ("^## \\[" ver "\\]") { grab=1; next }
  grab && /^## \[/ { exit }
  grab { print }
' "$root/CHANGELOG.md")"

if [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
  echo "release-notes: no CHANGELOG section found for '[$ver]'" >&2
  exit 1
fi

# Trim leading/trailing blank lines, keep the body intact (portable awk, no tac).
printf '%s\n' "$out" | awk '
  { lines[NR] = $0 }
  END {
    s = 1;  while (s <= NR && lines[s] == "") s++
    e = NR; while (e >= 1  && lines[e] == "") e--
    for (i = s; i <= e; i++) print lines[i]
  }
'
