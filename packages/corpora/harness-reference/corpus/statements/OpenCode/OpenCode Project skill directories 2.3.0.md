---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - .opencode/skills
      - .claude/skills
      - .agents/skills
    legacy_dirs:
      - .opencode/skill
    note: Every config directory contributes a `skills` folder and, as a legacy name, a `skill` folder. The `skills` array in opencode.json adds more directories or HTTP catalogs.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs project directories v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20project%20directories%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The discovery table on the skills page lists .opencode/skills, and .claude/skills and .agents/skills for compatibility.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode config skill and skills folders source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20config%20skill%20and%20skills%20folders%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The config skill plugin adds both `skill` and `skills` under each config directory as skill sources.
reportedIn:
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
  - "[OpenCode source config plugin skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
supersedes: "[OpenCode Project skill directories](OpenCode%20Project%20skill%20directories.md)"
---

The 2026-08-08 statement listed `.opencode` with no subfolder and asked which folder is meant. At v2.3.0 the project folder is `.opencode/skills`; the source also reads a `skill` folder beside it, which the docs do not list. The `.claude/skills` and `.agents/skills` entries rest on the docs table; their loader was not read.
