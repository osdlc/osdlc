---
kind: run
specifiedBy: "[pi model selection](../../methods/pi%20model%20selection/pi%20model%20selection.md)"
reportedIn:
  - "[pi harness notes for a dispatcher](../../documents/skillwright/pi%20harness%20notes%20for%20a%20dispatcher.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.1.0
version_basis: exact
observed: 2026-10-09
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
imported_from: fact:cli/model-selection@pi#observation-1
---

Imported from `facts/pi/cli/model-selection.md`, observation 1.

- model: "--model <pattern> (provider/id selects the provider)"
- provider: "--provider <name>"
- effort: "--thinking off|minimal|low|medium|high|xhigh|max, clamped to the model; or a :<level> suffix on --model"
- model_list: "--list-models [search]"
- context: "contextWindow per model in ~/.pi/agent/models.json"
