#!/usr/bin/env bash
# Installs Claude Code $CLAUDE_CODE_VERSION and the plugins in $PLUGINS
# (plugin@marketplace, space separated) from the marketplace at $MARKETPLACE_URL.
# When $MARKETPLACES (name=url [ref], one per line) is set, it wins: agent-setup
# installs Claude Code and the plugins from those marketplaces instead.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
if [ -n "${MARKETPLACES//[[:space:]]/}" ]; then
  HARNESS=claude VERSION="$CLAUDE_CODE_VERSION" exec "$(dirname "$0")/../pr-common/install-agent.sh"
fi
curl -fsSL https://claude.ai/install.sh | bash -s -- "$CLAUDE_CODE_VERSION"
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
claude="$HOME/.local/bin/claude"
if [ -n "${PLUGINS// /}" ]; then
  "$claude" plugin marketplace add "$MARKETPLACE_URL"
  for plugin in $PLUGINS; do "$claude" plugin install "$plugin"; done
fi
