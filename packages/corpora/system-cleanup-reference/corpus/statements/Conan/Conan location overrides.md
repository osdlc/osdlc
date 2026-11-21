---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: location/override
  object:
    vars:
    - CONAN_HOME
    settings:
    - core.cache:storage_path
    - core.download:download_cache
    - .conanrc conan_home
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan location overrides 1](../../study-results/Conan/2026-11-21%20Conan%20location%20overrides%201.md)'
  - '[2026-11-21 Conan location overrides 2](../../study-results/Conan/2026-11-21%20Conan%20location%20overrides%202.md)'
  - '[2026-11-21 Conan location overrides 3](../../study-results/Conan/2026-11-21%20Conan%20location%20overrides%203.md)'
  - '[2026-11-21 Conan location overrides 4](../../study-results/Conan/2026-11-21%20Conan%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The docs document CONAN_HOME and the storage_path and download_cache confs; the source
    also reads conan_home from a .conanrc file.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The docs document CONAN_HOME and the storage_path and download_cache confs; the source also reads conan_home from a .conanrc file.
