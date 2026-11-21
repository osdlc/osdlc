---
kind: source
store: '[Hex](../../stores/Hex.md)'
observed: '2026-11-21'
locator: cache_path
reportedIn:
- '[lib hex scm.ex](../../documents/Hex/lib%20hex%20scm.ex.md)'
excerpt:
  exact: Path.join([Hex.State.fetch!(:cache_home), @packages_dir, repo, filename])
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

lib hex scm.ex (https://raw.githubusercontent.com/hexpm/hex/main/lib/hex/scm.ex) says, under cache_path:

> Path.join([Hex.State.fetch!(:cache_home), @packages_dir, repo, filename])
