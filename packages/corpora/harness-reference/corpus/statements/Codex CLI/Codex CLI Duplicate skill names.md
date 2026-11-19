---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/duplicate-names
  object:
    mention: a `$name` mention needs exactly one enabled match, else it is skipped silently
    other_lookup: first enabled match
    result: both are kept and can appear in selectors; no merge, no shadowing stated
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Codex CLI Duplicate skill names](../../study-results/Codex%20CLI/2026-10-01%20Codex%20CLI%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Duplicate skill names](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - When the model picks a skill by name and two skills share it, which one loads?
imported_from: fact:skills/duplicate-names@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/duplicate-names.md`.

Open questions:
- When the model picks a skill by name and two skills share it, which one loads?
