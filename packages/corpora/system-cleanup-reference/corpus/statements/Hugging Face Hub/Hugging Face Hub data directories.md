---
proposition:
  subject: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.cache/huggingface/hub
      holds: models
      rebuild: re-download
    - platform: all
      path: ~/.cache/huggingface/xet
      holds: cache
      rebuild: re-download
    - platform: all
      path: ~/.cache/huggingface/assets
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hugging Face Hub data directories 1](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%201.md)'
  - '[2026-11-21 Hugging Face Hub data directories 2](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%202.md)'
  - '[2026-11-21 Hugging Face Hub data directories 3](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%203.md)'
  - '[2026-11-21 Hugging Face Hub data directories 4](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%204.md)'
  - '[2026-11-21 Hugging Face Hub data directories 5](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%205.md)'
  - '[2026-11-21 Hugging Face Hub data directories 6](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%206.md)'
  - '[2026-11-21 Hugging Face Hub data directories 7](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20data%20directories%207.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The cache guide and env-var reference give ~/.cache/huggingface/hub (models, datasets,
    spaces), xet and assets under HF_HOME; the cache carries a CACHEDIR.TAG marking it re-downloadable.
    Files fetched with `hf download --local-dir` go to a folder the user chose and are not in this cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs do not spell out the Windows path; `~` presumably resolves to %USERPROFILE%, but no page states
  it.
- Assets are written by downstream libraries; whether each can be regenerated depends on that library.
---

The cache guide and env-var reference give ~/.cache/huggingface/hub (models, datasets, spaces), xet and assets under HF_HOME; the cache carries a CACHEDIR.TAG marking it re-downloadable. Files fetched with `hf download --local-dir` go to a folder the user chose and are not in this cache.
