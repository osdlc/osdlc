---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/live-reload
  object:
    supported: true
    restart_needed: false
    scope: skill source directories are watched; a change rescans the sources after a 100 ms debounce
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill watcher rescan source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill%20watcher%20rescan%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The skill config plugin subscribes to watcher events, debounces them for 100 ms, rescans and reloads the skills.
reportedIn:
  - "[OpenCode source config plugin skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Skill edits mid-session](../../subjects/skills/Skill%20edits%20mid-session.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
supersedes: "[OpenCode Skill edits mid-session open](OpenCode%20Skill%20edits%20mid-session%20open.md)"
---

Read from `packages/core/src/config/plugin/skill.ts` at v2.3.0, not observed in a run.
