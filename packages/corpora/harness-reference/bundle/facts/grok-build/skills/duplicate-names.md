---
type: Harness Fact
title: "Grok Build: Duplicate skill names"
description: "Duplicate skill names in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/duplicate-names
observations:
  - value: {"behavior": "higher-priority location overrides lower", "order": ["./.grok/skills (cwd)", "<repo_root>/.grok/skills", "~/.grok/skills and ~/.claude/skills", "project .claude and .cursor skills rank high"], "plugin_skill": "does not override a native skill; stays available as plugin:name", "builtin_collision": "both stay invocable, skill advertised under a scope-qualified name such as /user:commit"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:29 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "The table lists ./.claude/skills as High but above ~/.grok/skills; exact tie order between .grok, .agents and .claude at one tier is not stated."
open:
  - question: "Within one tier, which of .grok/skills, .agents/skills and .claude/skills wins a name clash?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Grok Build](/harnesses/grok-build.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: behavior: higher-priority location overrides lower; order: ./.grok/skills (cwd), <repo_root>/.grok/skills, ~/.grok/skills and ~/.claude/skills, project .claude and .cursor skills rank high; plugin skill: does not override a native skill; stays available as plugin:name; builtin collision: both stay invocable, skill advertised under a scope-qualified name such as /user:commit. The table lists ./.claude/skills as High but above ~/.grok/skills; exact tie order between .grok, .agents and .claude at one tier is not stated.[^grok-build-skills]

  > Grok deduplicates skills by name -- a higher-priority location overrides a lower one.

## Open questions

- Within one tier, which of .grok/skills, .agents/skills and .claude/skills wins a name clash?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
