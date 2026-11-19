---
name: paths-root
description: Reads two files and runs two scripts that ship with this plugin, and reports the marker each one holds. Use when asked to use the paths-root skill.
---

# Paths root

Do these four steps in order.

1. Read the [guide](${CLAUDE_PLUGIN_ROOT}/skills/paths-root/references/guide.md) and report the
   marker it holds.
2. Read the [style](${CLAUDE_PLUGIN_ROOT}/references/style.md) and report the marker it holds.
3. Run `${CLAUDE_PLUGIN_ROOT}/skills/paths-root/scripts/check.sh` and report its full output.
4. Run `${CLAUDE_PLUGIN_ROOT}/scripts/tool.sh --check` and report its full output.

For each step, list every attempt in order: the exact path you read or the exact command line you
ran, the working directory, and the output or error. Then report the absolute path of this
SKILL.md file.
