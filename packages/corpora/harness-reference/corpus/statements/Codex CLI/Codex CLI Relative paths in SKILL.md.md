---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/relative-paths
  object:
    resolves_from: the directory containing SKILL.md
    model_told_location: true
    tells_model: yes in the skills instructions that list short paths under a skill roots table; the other variant only says to use the same access mechanism
    line: When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the directory containing that expanded `SKILL.md` first, and only consider other paths if needed.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Relative paths in SKILL.md source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Relative%20paths%20in%20SKILL.md%20source.md)"
      - "[2026-11-14 Codex CLI Skill fragment body source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20fragment%20body%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2: the instruction text, and the SKILL.md path given with a selected skill."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Relative paths in SKILL.md other variant source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Relative%20paths%20in%20SKILL.md%20other%20variant%20source.md)"
    directionOfEvidenceProvided: neutral
    description: The second variant of the skills instructions does not carry the relative-path line.
reportedIn:
  - "[openai codex ext skills src catalog_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20catalog_prompt.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src fragments.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20fragments.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Relative paths in SKILL.md](../../subjects/skills/Relative%20paths%20in%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Relative paths in SKILL.md open](Codex%20CLI%20Relative%20paths%20in%20SKILL.md%20open.md)"
open:
  - Does the model follow the line? No run was made, so this statement names no model.
---

The model always gets the SKILL.md path: in the skills list, and in the `<path>` element when a skill is injected. The sentence about relative paths is part of one of the two instruction texts Codex can render.
