---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: build
      marker: conanfile.py
      holds: build-output
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan build directories 1](../../study-results/Conan/2026-11-21%20Conan%20build%20directories%201.md)'
  - '[2026-11-21 Conan build directories 2](../../study-results/Conan/2026-11-21%20Conan%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Recipes using cmake_layout get a base build folder named build by default; conanfile.py
    is the recipe file name in the source.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The build folder only exists for recipes that use cmake_layout (or set it themselves); projects with
  conanfile.txt are marked differently.
---

Recipes using cmake_layout get a base build folder named build by default; conanfile.py is the recipe file name in the source.
