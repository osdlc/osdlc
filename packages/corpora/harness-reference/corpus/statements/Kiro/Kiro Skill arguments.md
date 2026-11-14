---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: skills/arguments
  object:
    supported: partial
    placeholders:
      - $ARGUMENTS
      - ${N}
    cli_only: true
    ide: text after the slash command is passed to the agent as extra context
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Kiro Skill arguments](../../study-results/Kiro/2026-11-04%20Kiro%20Skill%20arguments.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-14 kiro skills page placeholders rendered](../../study-results/Kiro/2026-11-14%20kiro%20skills%20page%20placeholders%20rendered.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The rendered skills page names $ARGUMENTS and ${N} and says substitution is CLI-only.
  - hasEvidenceItems:
      - "[2026-11-14 kiro skills markdown placeholders](../../study-results/Kiro/2026-11-14%20kiro%20skills%20markdown%20placeholders.md)"
    directionOfEvidenceProvided: neutral
    description: 'The Markdown export of the same page reads "`$ARGUMENTS` or `$` placeholders": the `{N}` is lost in the export, so it is not a different claim.'
reportedIn:
  - "[Kiro docs Agent Skills](../../documents/kiro.dev/Kiro%20docs%20Agent%20Skills.md)"
  - "[Kiro docs Agent Skills Markdown](../../documents/kiro.dev/Kiro%20docs%20Agent%20Skills%20Markdown.md)"
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
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Skill arguments](../../subjects/skills/Skill%20arguments.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What does N count from in `${N}`, and is `$1` accepted too? The docs page does not say.
imported_from: fact:skills/arguments@kiro#scope-[null,null,null]
---

Imported from `facts/kiro/skills/arguments.md`.

Checked on 2026-11-14 against the rendered page, quoted word for word this time: the placeholders are `$ARGUMENTS` and `${N}`. The page's `.md` export shows `$` in place of `${N}`; the rendered HTML and the page data both hold `${N}`.
