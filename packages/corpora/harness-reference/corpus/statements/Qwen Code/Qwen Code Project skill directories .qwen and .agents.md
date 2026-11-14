---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - .qwen/skills
      - .agents/skills
    note: "`.qwen/skills` wins on a name clash"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill provider dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20provider%20dirs%20source.md)"
      - "[2026-11-14 Qwen Code Project skill base dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Project%20skill%20base%20dirs%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: At v0.27.3 the project level maps SKILL_PROVIDER_CONFIG_DIRS (.qwen, .agents) to <project root>/<dir>/skills.
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Project agents skills docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Project%20agents%20skills%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills docs at v0.27.3 say project skills are also read from .agents/skills and .qwen/skills wins.
reportedIn:
  - "[Qwen Code source storage.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20storage.ts%20at%20ddeba2f.md)"
  - "[Qwen Code source skill-manager.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20skill-manager.ts%20at%20ddeba2f.md)"
  - "[Qwen Code docs source skills.md at ddeba2f](../../documents/github.com/Qwen%20Code%20docs%20source%20skills.md%20at%20ddeba2f.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Qwen Code Project skill directories](Qwen%20Code%20Project%20skill%20directories.md)"
---

The 2026-08-08 statement listed only `.qwen/skills`. The source and docs at v0.27.3 also read `.agents/skills` in the project. No source read here says when `.agents/skills` was added, so the scope is not limited.
