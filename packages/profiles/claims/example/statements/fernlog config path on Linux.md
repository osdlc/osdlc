---
proposition:
  subject: fernlog 2.3
  predicate: reads config from
  object:
    paths:
      - ~/.config/fernlog/config.toml
platform: linux
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[README on config](../study-results/README%20on%20config.md)"
      - "[Linux probe](../study-results/linux/Linux%20probe/Linux%20probe.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: >-
      The README names this path, and a test run on Linux shows fernlog reading it and nothing
      else.
contributions:
  - contributor: { name: Sam Example, agentType: person }
    activityType: created
    date: 2026-11-04T09:00:00Z
---

The sharper claim from [fernlog config path](fernlog%20config%20path.md): the same path, on Linux
only. It cites the same README and the same Linux run, and leaves out the macOS run, so nothing
disputes it.

This record shows two things the claims types allow a corpus to do.

- `platform` is a field the claims types do not define. A corpus adds the fields its own claims
  need. The validator accepts it and does not check it. To check it, add it to the corpus's copy
  of `statements.schema.md`.
- The proposition's `object` is an object, not text. Here it is a list of the paths fernlog reads,
  so a tool can read the value without parsing a sentence.
