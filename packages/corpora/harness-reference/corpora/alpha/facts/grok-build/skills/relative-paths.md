---
type: Harness Fact
title: "Grok Build: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/relative-paths
observations:
  - value: {"plugin_helper_scripts": "run by relative path from the skill", "base_directory_line": "not stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-plugins
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:413 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "What folder do relative paths in a SKILL.md body resolve from, and does the loaded text tell the model that folder?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Grok Build](/harnesses/grok-build.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: plugin helper scripts: run by relative path from the skill; base directory line: not stated.[^grok-build-plugins]

  > Put the script in the plugin and have the skill run it by relative path; it is copied to the machine with the plugin.

## Open questions

- What folder do relative paths in a SKILL.md body resolve from, and does the loaded text tell the model that folder?[^grok-build-skills]

[^grok-build-plugins]: Grok Build user guide: Plugins
[^grok-build-skills]: Grok Build user guide: Skills
