---
kind: docs
reportedIn:
  - "[Claude Code docs CLI reference](../../documents/code.claude.com/Claude%20Code%20docs%20CLI%20reference.md)"
version: 2.1.319
version_basis: inferred
locator: CLI flags, --add-dir
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: --add-dir Add additional working directories for Claude to read and edit files. Grants file access; Claude Code doesn’t discover most .claude/ configuration from these directories. Validates that each path exists as a directory. You can’t add most network paths, such as \\server\share. To persist these directories across sessions, set permissions.additionalDirectories in settings
  prefix: "lable. Flag Description Example "
  suffix: " claude --add-dir ../apps ../lib"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> --add-dir Add additional working directories for Claude to read and edit files. Grants file access; Claude Code doesn’t discover most .claude/ configuration from these directories. Validates that each path exists as a directory. You can’t add most network paths, such as \\server\share. To persist these directories across sessions, set permissions.additionalDirectories in settings
