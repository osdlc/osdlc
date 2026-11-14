---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    note: Skill roots are .agents/skills, the skills folder of each config layer, plugin skills and bundled system skills.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill roots folder names source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20folder%20names%20source.md)"
      - "[2026-11-14 Codex CLI Skill roots project layer source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20project%20layer%20source.md)"
      - "[2026-11-14 Codex CLI Skill roots user layer source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20user%20layer%20source.md)"
      - "[2026-11-14 Codex CLI Skill roots repository walk source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20repository%20walk%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the code that builds the skill roots names no .claude folder. A listing is evidence of absence, one step below its kind."
reportedIn:
  - "[openai codex ext skills src host_roots.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No source says in words that `.claude/skills` is not read. The answer rests on the list of roots in `host_roots.rs`.
