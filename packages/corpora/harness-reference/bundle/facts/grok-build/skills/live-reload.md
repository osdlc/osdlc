---
type: Harness Fact
title: "Grok Build: Skill edits mid-session"
description: "Skill edits mid-session in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/live-reload
observations:
  - value: {"supported": true, "delay": "within a few seconds"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:147 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
  - value: {"scope": "plugins", "action": "press r in the Plugins tab or start a new session"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-plugins
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:80 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Grok Build](/harnesses/grok-build.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: yes; delay: within a few seconds.[^grok-build-skills]

  > The new skill appears in the slash menu within a few seconds, because Grok reloads skills when files change on disk.
- 2026-11-04: scope: plugins; action: press r in the Plugins tab or start a new session.[^grok-build-plugins]

  > To pick up a newly installed plugin, press `r` in the Plugins tab or start a new session.

[^grok-build-skills]: Grok Build user guide: Skills
[^grok-build-plugins]: Grok Build user guide: Plugins
