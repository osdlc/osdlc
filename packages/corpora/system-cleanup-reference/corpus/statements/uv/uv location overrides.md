---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: location/override
  object:
    vars:
    - UV_CACHE_DIR
    - XDG_CACHE_HOME
    - XDG_DATA_HOME
    - UV_PYTHON_INSTALL_DIR
    - UV_TOOL_DIR
    - UV_PROJECT_ENVIRONMENT
    settings:
    - cache-dir
    - --cache-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv location overrides 1](../../study-results/uv/2026-11-21%20uv%20location%20overrides%201.md)'
  - '[2026-11-21 uv location overrides 2](../../study-results/uv/2026-11-21%20uv%20location%20overrides%202.md)'
  - '[2026-11-21 uv location overrides 3](../../study-results/uv/2026-11-21%20uv%20location%20overrides%203.md)'
  - '[2026-11-21 uv location overrides 4](../../study-results/uv/2026-11-21%20uv%20location%20overrides%204.md)'
  - '[2026-11-21 uv location overrides 5](../../study-results/uv/2026-11-21%20uv%20location%20overrides%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching page names --cache-dir, UV_CACHE_DIR and tool.uv.cache-dir; the storage page
    names the variables for Python, tool and project-environment locations.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The caching page names --cache-dir, UV_CACHE_DIR and tool.uv.cache-dir; the storage page names the variables for Python, tool and project-environment locations.
