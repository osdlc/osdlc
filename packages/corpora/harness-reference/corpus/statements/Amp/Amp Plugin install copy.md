---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: plugins/install-copy
  object:
    install: amp plugins add <url> installs a single-file plugin
    copied: a hosted import copies the item into the personal repository and records where it came from
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 plugins add single-file from URL](../../study-results/Amp/2026-11-14%20plugins%20add%20single-file%20from%20URL.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page says the command installs a single-file plugin.
  - hasEvidenceItems:
      - "[2026-11-14 import copies and records origin](../../study-results/Amp/2026-11-14%20import%20copies%20and%20records%20origin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The global plugins page says an import is a copy with its origin recorded.
reportedIn:
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
  - "[Amp docs Global Plugins & Skills](../../documents/ampcode.com/Amp%20docs%20Global%20Plugins%20&%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Amp Plugin install copy open](Amp%20Plugin%20install%20copy%20open.md)"
open:
  - "Does amp plugins add or amp skill add copy the folder whole, and do exec bits and symlinks survive?"
---

What happens to exec bits and symlinks is not stated; the question is kept in `open`.
