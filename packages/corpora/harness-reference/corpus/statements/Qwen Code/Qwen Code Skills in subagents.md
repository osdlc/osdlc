---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/subagent-visibility
  object:
    can_load_skills: true
    startup: the available-skills listing, when the subagent has the Skill tool
    disable_with: list `skill` in `disallowedTools`, or give a `tools` list without it
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Subagent skill tool predicate source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Subagent%20skill%20tool%20predicate%20source.md)"
      - "[2026-11-14 Qwen Code Subagent skill manager source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Subagent%20skill%20manager%20source.md)"
      - "[2026-11-14 Qwen Code Subagent skills listing source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Subagent%20skills%20listing%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: a subagent with no tool config inherits the registry, Skill tool included; one whose policy leaves out the Skill tool gets no skill manager and no listing"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Subagent tools inherit docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Subagent%20tools%20inherit%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: a subagent with no tools list inherits the parent's tools"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source, not run. A subagent keeps the session skill manager and is shown the skills listing when its tool policy includes the Skill tool. An agent whose tool policy leaves out the Skill tool gets neither.
