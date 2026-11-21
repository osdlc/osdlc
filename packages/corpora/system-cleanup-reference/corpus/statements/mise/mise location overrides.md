---
proposition:
  subject: '[mise](../../stores/mise.md)'
  predicate: location/override
  object:
    vars:
    - MISE_DATA_DIR
    - MISE_CACHE_DIR
    - MISE_STATE_DIR
    - MISE_INSTALLS_DIR
    - MISE_INSTALL_STORE_DIR
    - MISE_DOWNLOADS_DIR
    - MISE_PLUGINS_DIR
    - MISE_TMP_DIR
    - XDG_DATA_HOME
    - XDG_CACHE_HOME
    - MISE_DOWNLOAD_CACHE_MAX_SIZE
    settings:
    - download_cache
    - download_cache_max_size
    - cache_prune_age
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 mise location overrides 1](../../study-results/mise/2026-11-21%20mise%20location%20overrides%201.md)'
  - '[2026-11-21 mise location overrides 2](../../study-results/mise/2026-11-21%20mise%20location%20overrides%202.md)'
  - '[2026-11-21 mise location overrides 3](../../study-results/mise/2026-11-21%20mise%20location%20overrides%203.md)'
  - '[2026-11-21 mise location overrides 4](../../study-results/mise/2026-11-21%20mise%20location%20overrides%204.md)'
  - '[2026-11-21 mise location overrides 5](../../study-results/mise/2026-11-21%20mise%20location%20overrides%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The Directories page names the MISE_*_DIR overrides and XDG fallbacks; the settings source
    names the download-cache settings; the cache prune page names cache_prune_age.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[mise](../../stores/mise.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The MISE_DATA_DIR, MISE_DOWNLOADS_DIR and MISE_PLUGINS_DIR names are given in a table rather than prose.
---

The Directories page names the MISE_*_DIR overrides and XDG fallbacks; the settings source names the download-cache settings; the cache prune page names cache_prune_age.
