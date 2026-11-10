---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/agent-loading
  object:
    mechanism: Skill tool, or user invocation with /skill-name
    body_at_startup: false
    body_on: invocation, by user or by Claude when relevant
    after_load: rendered SKILL.md enters the conversation as one message and stays across turns; file is not re-read
    built_ins_via_skill_tool: /init and /security-review
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Claude Code How the agent loads a skill](../../study-results/Claude%20Code/2026-10-01%20Claude%20Code%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code How the agent loads a skill](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code How the agent loads a skill 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20How%20the%20agent%20loads%20a%20skill%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code How the agent loads a skill 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20How%20the%20agent%20loads%20a%20skill%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: disputed
imported_from: fact:skills/agent-loading@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/agent-loading.md`.

The observations disagree on: mechanism. The latest value is kept.
