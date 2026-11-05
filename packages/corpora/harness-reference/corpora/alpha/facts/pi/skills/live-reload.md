---
type: Harness Fact
title: "pi: Skill edits mid-session"
description: "Skill edits mid-session in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/live-reload
observations:
  - value: {"live_reload": "partial", "manual_command": "/reload"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Validate and share a skill"
    evidence: docs
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [pi](/harnesses/pi.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: live reload: partial; manual command: /reload.[^pi-skills]

  > Run `/reload` after editing a skill during an active session.

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
