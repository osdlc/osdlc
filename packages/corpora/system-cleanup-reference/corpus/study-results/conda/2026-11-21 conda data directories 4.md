---
kind: source
store: '[conda](../../stores/conda.md)'
observed: '2026-11-21'
locator: mockable_context_envs_dirs
reportedIn:
- '[conda base context.py](../../documents/conda/conda%20base%20context.py.md)'
excerpt:
  exact: join("~", ".conda", "envs"),
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

conda base context.py (https://raw.githubusercontent.com/conda/conda/main/conda/base/context.py) says, under mockable_context_envs_dirs:

> join("~", ".conda", "envs"),
