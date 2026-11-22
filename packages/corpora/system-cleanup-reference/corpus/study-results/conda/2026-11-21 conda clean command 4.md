---
kind: docs
store: '[conda](../../stores/conda.md)'
observed: '2026-11-21'
locator: Removal Targets
version: 26.11.0.dev60
version_basis: exact
reportedIn:
- '[conda clean — conda documentation](../../documents/conda/conda%20clean%20%E2%80%94%20conda%20documentation.md)'
excerpt:
  exact: 'WARNING: This will break environments with packages installed using symlinks back to the package
    cache.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

conda clean — conda documentation (https://docs.conda.io/projects/conda/en/latest/commands/clean.html) says, under Removal Targets:

> WARNING: This will break environments with packages installed using symlinks back to the package cache.
