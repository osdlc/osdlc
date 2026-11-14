---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: skills/relative-paths
  object:
    resolves_from: skill directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Amp Relative paths in SKILL.md](../../study-results/Amp/2026-11-04%20Amp%20Relative%20paths%20in%20SKILL.md.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-14 plugin api bundled skill baseDir placeholder](../../study-results/Amp/2026-11-14%20plugin%20api%20bundled%20skill%20baseDir%20placeholder.md)"
    directionOfEvidenceProvided: neutral
    description: The Plugin API page's example of a skill bundled in a plugin writes a path as {baseDir}/reference/checklist.md. The page does not define the placeholder.
reportedIn:
  - "[Amp docs Skills](../../documents/ampcode.com/Amp%20docs%20Skills.md)"
  - "[Amp docs Plugin API](../../documents/ampcode.com/Amp%20docs%20Plugin%20API.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Relative paths in SKILL.md](../../subjects/skills/Relative%20paths%20in%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Amp tell the model the skill folder when a skill loads?
  - What does `{baseDir}` in a SKILL.md body expand to, and is it replaced in every skill or only in a skill a plugin registers? The Plugin API page uses it in one example and does not define it.
imported_from: fact:skills/relative-paths@amp#scope-[null,null,null]
---

Imported from `facts/amp/skills/relative-paths.md`.

Open questions:
- Does Amp tell the model the skill folder when a skill loads?

Checked on 2026-11-14: the Plugin API page uses a `{baseDir}` placeholder in the SKILL.md of a bundled skill. No page read defines it, so the value is unchanged and the question is kept in `open`.
