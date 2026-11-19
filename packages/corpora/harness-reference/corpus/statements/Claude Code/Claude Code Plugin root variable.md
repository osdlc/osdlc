---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/plugin-root-variable
  object:
    variable: ${CLAUDE_PLUGIN_ROOT}
    resolves_to: absolute path of the plugin's installed version
    substituted_in:
      - skill, command and agent markdown body
      - hook command and args
      - MCP stdio command, args, env
      - MCP http/sse/ws url, headers, headersHelper
      - LSP command, args, env, workspaceFolder
    data_variable: ${CLAUDE_PLUGIN_DATA}
    data_resolves_to: ~/.claude/plugins/data/<id>, kept across updates
    not_in_bash_tool_env: true
    substituted_in_skill_also: allowed-tools Bash rules
    skills_substitution_note: CLAUDE_PLUGIN_ROOT is substituted only in plugin skills
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin root variable](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin root variable 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20root%20variable%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin root variable 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20root%20variable%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin root variable 4](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20root%20variable%204.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs plugins reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugins%20reference.md)"
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/plugin-root-variable@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/plugin-root-variable.md`.
