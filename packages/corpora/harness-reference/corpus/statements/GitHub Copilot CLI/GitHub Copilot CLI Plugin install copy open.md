---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/install-copy
  object:
    open: &a1
      - When Copilot CLI installs a plugin (git or local path), does it copy the whole folder, and do exec bits and symlinks survive?
direction: neutral
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: open
open: *a1
imported_from: fact:plugins/install-copy@copilot-cli#open
---

Imported from `facts/copilot-cli/plugins/install-copy.md`.

Open questions:
- When Copilot CLI installs a plugin (git or local path), does it copy the whole folder, and do exec bits and symlinks survive?
