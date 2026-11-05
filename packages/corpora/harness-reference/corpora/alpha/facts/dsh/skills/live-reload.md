---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skill edits mid-session"
description: "Skill edits mid-session in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/live-reload
observations:
  - value: {"supported": true, "catalog": "watched roots refresh the catalog without a restart", "body": "every load re-reads the current file", "resource_edits": "edits below references, scripts and assets do not trigger a refresh"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-skill-filesystem
    locator: "packages/skill/skill-filesystem/README.md:12 at fcc0ad46"
    evidence: source
sources:
  - id: dsh-skill-filesystem
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/README.md"
    title: "dsh skill-filesystem package README"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: yes; catalog: watched roots refresh the catalog without a restart; body: every load re-reads the current file; resource edits: edits below references, scripts and assets do not trigger a refresh.[^dsh-skill-filesystem]

  > the provider ... watches the directories, so new, renamed, or deleted skills reach agents without a restart.

[^dsh-skill-filesystem]: dsh skill-filesystem package README
