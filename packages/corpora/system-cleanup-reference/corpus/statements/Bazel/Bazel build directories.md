---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: bazel-bin
      marker: MODULE.bazel
      holds: build-output
      rebuild: rebuild
    - path: bazel-out
      marker: MODULE.bazel
      holds: build-output
      rebuild: rebuild
    - path: bazel-testlogs
      marker: MODULE.bazel
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel build directories 1](../../study-results/Bazel/2026-11-21%20Bazel%20build%20directories%201.md)'
  - '[2026-11-21 Bazel build directories 2](../../study-results/Bazel/2026-11-21%20Bazel%20build%20directories%202.md)'
  - '[2026-11-21 Bazel build directories 3](../../study-results/Bazel/2026-11-21%20Bazel%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Bazel puts convenience symlinks into the workspace that point into the output base; deleting
    them frees no space by itself (the data lives in the output base), and bazel clean removes them. Markers
    are MODULE.bazel, REPO.bazel or, in legacy setups, WORKSPACE / WORKSPACE.bazel.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Bazel puts convenience symlinks into the workspace that point into the output base; deleting them frees no space by itself (the data lives in the output base), and bazel clean removes them. Markers are MODULE.bazel, REPO.bazel or, in legacy setups, WORKSPACE / WORKSPACE.bazel.
