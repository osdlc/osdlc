---
type: Harness Fact
title: "Antigravity CLI: Plugin install location"
description: "Plugin install location in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/install-location
observations:
  - value: {"path": "~/.gemini/config/plugins/<plugin_name>", "workspace_path": ".agents/plugins"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-plugins
    evidence: docs
    note: "Another docs page names ~/.gemini/antigravity-cli/plugins/<plugin_name>/ (seen only in a search summary). Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does a local-folder install copy the folder or use it in place?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-plugins
    resource: "https://antigravity.google/docs/plugins/"
    title: "Antigravity docs: Plugins"
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Antigravity CLI](/harnesses/antigravity.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: path: ~/.gemini/config/plugins/<plugin_name>; workspace path: .agents/plugins. Another docs page names ~/.gemini/antigravity-cli/plugins/<plugin_name>/ (seen only in a search summary). Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-plugins]

  > When installed, the CLI stages plugin assets in your global configuration directory:

## Open questions

- Does a local-folder install copy the folder or use it in place?[^antigravity-skills]

[^antigravity-plugins]: Antigravity docs: Plugins
[^antigravity-skills]: Antigravity docs: Agent skills
