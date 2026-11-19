---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: prefix doubled; the authored name is never split
    example: acme-tools:acme-tools:review
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Pre-qualified skill name test source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Pre-qualified%20skill%20name%20test%20source.md)"
      - "[2026-11-14 Qwen Code qualifySkillName source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20qualifySkillName%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the name is built by concatenation, and a unit test pins `rust:rust:chat` for `rust:chat` inside `rust`"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The extension name is always put in front of the authored name. The example applies the tested rule to plugin `acme-tools` and skill `review`.
