---
type: Harness Fact
title: "Amp: Skill edits mid-session"
description: "Skill edits mid-session in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/live-reload
observations:
  - value: {"live_reload": false, "manual_reload": "reload_skills tool, or ask Amp to reload", "new_threads": "load published skills automatically"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Viewing and Reloading Skills"
    evidence: docs
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Amp](/harnesses/amp.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: live reload: no; manual reload: reload_skills tool, or ask Amp to reload; new threads: load published skills automatically.[^amp-skills]

  > The `reload_skills` tool rescans local directories and fetches the latest personal and workspace skills.

[^amp-skills]: Amp docs: Skills
