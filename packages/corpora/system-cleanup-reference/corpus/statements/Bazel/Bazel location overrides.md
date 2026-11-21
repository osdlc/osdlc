---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: location/override
  object:
    vars:
    - XDG_CACHE_HOME
    - TEST_TMPDIR
    settings:
    - --output_base
    - --output_user_root
    - --repository_cache
    - --disk_cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel location overrides 1](../../study-results/Bazel/2026-11-21%20Bazel%20location%20overrides%201.md)'
  - '[2026-11-21 Bazel location overrides 2](../../study-results/Bazel/2026-11-21%20Bazel%20location%20overrides%202.md)'
  - '[2026-11-21 Bazel location overrides 3](../../study-results/Bazel/2026-11-21%20Bazel%20location%20overrides%203.md)'
  - '[2026-11-21 Bazel location overrides 4](../../study-results/Bazel/2026-11-21%20Bazel%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The output-directories page names the environment variables and startup options that move
    the output root; the build page names --repository_cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The output-directories page names the environment variables and startup options that move the output root; the build page names --repository_cache.
