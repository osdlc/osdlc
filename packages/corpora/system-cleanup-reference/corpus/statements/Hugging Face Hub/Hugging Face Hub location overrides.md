---
proposition:
  subject: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
  predicate: location/override
  object:
    vars:
    - HF_HOME
    - HF_HUB_CACHE
    - HF_XET_CACHE
    - HF_ASSETS_CACHE
    - XDG_CACHE_HOME
    - HUGGINGFACE_HUB_CACHE
    settings:
    - cache_dir argument
    - --cache-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hugging Face Hub location overrides 1](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20location%20overrides%201.md)'
  - '[2026-11-21 Hugging Face Hub location overrides 2](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20location%20overrides%202.md)'
  - '[2026-11-21 Hugging Face Hub location overrides 3](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20location%20overrides%203.md)'
  - '[2026-11-21 Hugging Face Hub location overrides 4](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The env-var reference documents HF_HOME, HF_HUB_CACHE, HF_XET_CACHE and HF_ASSETS_CACHE,
    XDG_CACHE_HOME as fallback, and HUGGINGFACE_HUB_CACHE as the legacy name of HF_HUB_CACHE.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The env-var reference documents HF_HOME, HF_HUB_CACHE, HF_XET_CACHE and HF_ASSETS_CACHE, XDG_CACHE_HOME as fallback, and HUGGINGFACE_HUB_CACHE as the legacy name of HF_HUB_CACHE.
