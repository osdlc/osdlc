---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: config/main-file
  object:
    file: "cordis.patch.yml layers: bundle patches, $DSH_HOME/profiles/<name>, $DSH_HOME, then --patch files"
    format: YAML
    merge: a later layer replaces a row's whole config
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Main config file](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Main%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Main config file](../../subjects/config/Main%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:config/main-file@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/config/main-file.md`.
