#!/usr/bin/env bash
# Installs $HARNESS ($VERSION) and the $PLUGINS from the $MARKETPLACES through
# agent-setup. Plugins may be separated by spaces, commas or newlines.
set -e
: "${HARNESS:?HARNESS is required}"
plugins=$(printf '%s\n' "${PLUGINS:-}" | tr ',' '\n' | tr -s '[:space:]' '\n')
HARNESS="$HARNESS" VERSION="${VERSION:-}" MARKETPLACES="${MARKETPLACES:-}" PLUGINS="$plugins" \
  "$(dirname "$0")/../agent-setup/setup.sh"
