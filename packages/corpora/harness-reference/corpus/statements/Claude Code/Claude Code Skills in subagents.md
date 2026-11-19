---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/subagent-visibility
  object:
    inherits_parent_invoked_skills: false
    can_load_skills: true
    preload: skills frontmatter field injects full skill content at startup, up to the first 32 distinct names
    fresh_context: subagent does not see skills the parent already invoked
    disable_with: omit Skill from tools or add it to disallowedTools
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in subagents](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20subagents.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in subagents 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20subagents%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in subagents 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20subagents%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in subagents 4](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20subagents%204.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs subagents](../../documents/code.claude.com/Claude%20Code%20docs%20subagents.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/subagent-visibility@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/subagent-visibility.md`.
