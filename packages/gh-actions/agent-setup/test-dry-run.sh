#!/usr/bin/env bash
# Checks setup.sh's input handling with DRY_RUN=1: nothing is downloaded or
# installed, so it needs no network and no secrets. Each case states the
# inputs and a line the plan must print, or the error it must die with.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failures=0

expect() { # name, want (substring of output), then env assignments
  local name="$1" want="$2" out
  shift 2
  out="$(env -i PATH="$PATH" HOME="$HOME" DRY_RUN=1 "$@" bash "$here/setup.sh" 2>&1)"
  if [[ "$out" == *"$want"* ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected '$want' in:"
    printf '%s\n' "$out" | sed 's/^/     /'
    failures=$((failures + 1))
  fi
}

url=https://github.com/osdlc/marketplace.git

expect "cursor registers a marketplace given with leading spaces" \
  "harness install cursor --vault" \
  HARNESS=cursor MARKETPLACES="  osdlc=$url"
expect "cursor's vault is named after the trimmed marketplace name" \
  "/vaults/osdlc --path" \
  HARNESS=cursor MARKETPLACES="  osdlc=$url"
expect "cursor refuses plugins" \
  "plugins are not supported on cursor" \
  HARNESS=cursor MARKETPLACES="osdlc=$url" PLUGINS=craft@osdlc
expect "codex installs a plugin from its marketplace" \
  "--plugin craft --git-url $url" \
  HARNESS=codex MARKETPLACES="osdlc=$url" PLUGINS=craft@osdlc
expect "a plugin must name a listed marketplace" \
  "which is not in marketplaces" \
  HARNESS=codex MARKETPLACES="osdlc=$url" PLUGINS=craft@other
expect "claude cannot pin a marketplace ref" \
  "claude cannot pin a marketplace ref" \
  HARNESS=claude MARKETPLACES="osdlc=$url v1" PLUGINS=craft@osdlc
expect "a marketplace name may not start with a dot" \
  "agent-setup:" \
  HARNESS=codex MARKETPLACES="..=$url" PLUGINS=craft@..
expect "an unknown harness is refused" \
  "harness must be claude, codex or cursor" \
  HARNESS=gemini

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
