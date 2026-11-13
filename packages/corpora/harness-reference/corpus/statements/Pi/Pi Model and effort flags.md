---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/model-selection
  object:
    model: --model <pattern> (provider/id selects the provider)
    provider: --provider <name>
    effort: --thinking off|minimal|low|medium|high|xhigh|max, clamped to the model; or a :<level> suffix on --model
    model_list: --list-models [search]
    context: contextWindow per model in ~/.pi/agent/models.json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-09 Pi Model and effort flags](../../study-results/Pi/2026-10-09%20Pi%20Model%20and%20effort%20flags.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: run observed 2026-10-09.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help model thinking](../../study-results/Pi/2026-11-09%20Pi%20help%20model%20thinking.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --model accepts provider/id and :<thinking>.
reportedIn:
  - "[pi harness notes for a dispatcher](../../documents/skillwright/pi%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/model-selection@pi#scope-[null,null,null]
---

Imported from `facts/pi/cli/model-selection.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0.
