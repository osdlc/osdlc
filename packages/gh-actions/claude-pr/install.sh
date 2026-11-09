#!/usr/bin/env bash
# Installs Claude Code $CLAUDE_CODE_VERSION and the plugins in $PLUGINS
# (plugin@marketplace, space separated) from the marketplace at $MARKETPLACE_URL.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
curl -fsSL https://claude.ai/install.sh | bash -s -- "$CLAUDE_CODE_VERSION"
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
claude="$HOME/.local/bin/claude"
if [ -n "${PLUGINS// /}" ]; then
  "$claude" plugin marketplace add "$MARKETPLACE_URL"
  for plugin in $PLUGINS; do "$claude" plugin install "$plugin"; done
fi
