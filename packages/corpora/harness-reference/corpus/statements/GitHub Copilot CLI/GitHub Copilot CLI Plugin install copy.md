---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/install-copy
  object:
    copied: yes, components are cached at install and later sessions read from the cache; a local plugin is installed again to pick up changes
    local_plugins: path-sourced plugins in a local (directory-source) marketplace load live from their real directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin cache on install docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20cache%20on%20install%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin authoring how-to says install caches the components.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Local marketplace plugins load live docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Local%20marketplace%20plugins%20load%20live%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin reference names the exception.
reportedIn:
  - "[Copilot docs creating a plugin for Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20creating%20a%20plugin%20for%20Copilot%20CLI.md)"
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[GitHub Copilot CLI Plugin install copy open](GitHub%20Copilot%20CLI%20Plugin%20install%20copy%20open.md)"
open:
  - Does install copy the whole plugin folder, and do exec bits and symlinks survive?
---

The docs say install caches a plugin's components. They do not say whether the whole folder is copied, or what happens to exec bits and symlinks.
