---
kind: docs
reportedIn:
  - "[Pi docs Environment Variables at v1.5.0](../../documents/github.com/Pi%20docs%20Environment%20Variables%20at%20v1.5.0.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.0
version_basis: exact
observed: 2026-11-09
locator: Process Marker
excerpt:
  exact: "`AI_AGENT=pi` is a generic marker that lets tooling identify Pi as the agent that launched the process. - `PI_CODING_AGENT=true` is Pi-specific and lets child processes detect that they run inside Pi."
  prefix: "ints set two process markers: - "
  suffix: " Child processes inherit both ma"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---

> `AI_AGENT=pi` is a generic marker that lets tooling identify Pi as the agent that launched the process. - `PI_CODING_AGENT=true` is Pi-specific and lets child processes detect that they run inside Pi.
