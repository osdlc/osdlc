#!/usr/bin/env bash
# Installs Claude Code $VERSION, then adds each marketplace in $MARKETPLACES
# and installs each plugin in $PLUGINS (both newline-separated).
set -euo pipefail

: "${VERSION:?VERSION is required}"

curl -fsSL https://claude.ai/install.sh | bash -s -- "$VERSION"
claude="$HOME/.local/bin/claude"
"$claude" --version

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$HOME/.local/bin" >> "$GITHUB_PATH"
fi

while IFS= read -r source; do
  [ -n "$source" ] || continue
  "$claude" plugin marketplace add "$source"
done <<< "${MARKETPLACES:-}"

while IFS= read -r plugin; do
  [ -n "$plugin" ] || continue
  "$claude" plugin install "$plugin"
done <<< "${PLUGINS:-}"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "claude-path=$claude" >> "$GITHUB_OUTPUT"
fi
