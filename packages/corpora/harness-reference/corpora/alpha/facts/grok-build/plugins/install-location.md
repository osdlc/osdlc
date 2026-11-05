---
type: Harness Fact
title: "Grok Build: Plugin install location"
description: "Plugin install location in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/install-location
observations:
  - value: {"discovery_dirs": [".grok/plugins (project, needs trust)", "~/.grok/plugins (user, auto-trusted)", "[plugins].paths"], "claude_equivalents": ".claude/plugins also work"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-plugins
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:424 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "Where does grok plugin install put the files of a marketplace plugin, and is a local path copied or used in place?"
    observed: "2026-11-04"
    source: grok-build-plugins
sources:
  - id: grok-build-plugins
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Grok Build](/harnesses/grok-build.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: discovery dirs: .grok/plugins (project, needs trust), ~/.grok/plugins (user, auto-trusted), [plugins].paths; claude equivalents: .claude/plugins also work.[^grok-build-plugins]

  > | `~/.grok/plugins/` | User, every project | Trusted automatically |

## Open questions

- Where does grok plugin install put the files of a marketplace plugin, and is a local path copied or used in place?[^grok-build-plugins]

[^grok-build-plugins]: Grok Build user guide: Plugins
