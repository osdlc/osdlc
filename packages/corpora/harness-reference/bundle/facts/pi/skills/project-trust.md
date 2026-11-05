---
type: Harness Fact
title: "pi: Project skills and folder trust"
description: "Project skills and folder trust in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/project-trust
observations:
  - value: {"supported": true, "protected": ".pi/skills and project .agents/skills in the working directory or an ancestor", "declined": "skipped"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-security
    locator: "Resources protected by project trust"
    evidence: docs
  - value: {"declined_trust": "protected resources skipped"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-security
    locator: "Resources protected by project trust"
    evidence: docs
sources:
  - id: pi-security
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/security.md"
    title: "Pi docs: Security and project trust (main at d57c2d2)"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [pi](/harnesses/pi.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: supported: yes; protected: .pi/skills and project .agents/skills in the working directory or an ancestor; declined: skipped.[^pi-security]

  > project `.agents/skills` in the current directory or an ancestor directory
- 2026-11-04: declined trust: protected resources skipped.[^pi-security]

  > Declining project trust skips those protected resources, except for the initial `sessionDir` lookup described above.

[^pi-security]: Pi docs: Security and project trust (main at d57c2d2)
