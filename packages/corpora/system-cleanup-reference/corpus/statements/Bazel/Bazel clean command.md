---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: bazel clean
      removes: the action cache and the execroot (all build outputs) of the current workspace, plus the
        convenience symlinks
    - command: bazel clean --expunge
      removes: the whole output base of the current workspace, and stops its server
    - command: bazel clean --expunge_async
      removes: the whole output base, in the background
    - command: bazel build --experimental_disk_cache_gc_max_size=<size>
      removes: disk cache entries over the size limit, while idle (Bazel 7.4+)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel clean command 1](../../study-results/Bazel/2026-11-21%20Bazel%20clean%20command%201.md)'
  - '[2026-11-21 Bazel clean command 2](../../study-results/Bazel/2026-11-21%20Bazel%20clean%20command%202.md)'
  - '[2026-11-21 Bazel clean command 3](../../study-results/Bazel/2026-11-21%20Bazel%20clean%20command%203.md)'
  - '[2026-11-21 Bazel clean command 4](../../study-results/Bazel/2026-11-21%20Bazel%20clean%20command%204.md)'
  - '[2026-11-21 Bazel clean command 5](../../study-results/Bazel/2026-11-21%20Bazel%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The user manual and output-directories page describe bazel clean and --expunge; the caching
    page describes disk-cache garbage collection. No command prunes the shared repository cache or output
    bases of other workspaces.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Bazel command clears the repository cache or output bases of workspaces that no longer exist.
---

The user manual and output-directories page describe bazel clean and --expunge; the caching page describes disk-cache garbage collection. No command prunes the shared repository cache or output bases of other workspaces.
