---
proposition:
  subject: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: 'Eclipse Installer / Oomph Bundle Pool Management dialog: garbage collection'
      removes: pool artifacts and profiles no remaining installation uses, plus cached repository metadata
    - command: eclipse -clean
      removes: OSGi framework and runtime caches (bundle resolution and extension registry data), rebuilt
        on start
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Eclipse IDE clean command 1](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20clean%20command%201.md)'
  - '[2026-11-21 Eclipse IDE clean command 2](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20clean%20command%202.md)'
  - '[2026-11-21 Eclipse IDE clean command 3](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20clean%20command%203.md)'
  - '[2026-11-21 Eclipse IDE clean command 4](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Oomph's help describes garbage collection of the shared agent and clearing the metadata
    cache; the runtime options page says -clean sets osgi.clean, which wipes runtime caches.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source gives a headless command that garbage-collects ~/.p2/pool.
---

Oomph's help describes garbage collection of the shared agent and clearing the metadata cache; the runtime options page says -clean sets osgi.clean, which wipes runtime caches.
