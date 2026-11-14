---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/marketplace
  object:
    supported: true
    file: .grok-plugin/marketplace.json
    note: A marketplace is a GitHub repository, a git URL or a local folder that lists plugins. Grok also accepts .grok-plugin/plugin.json and the .claude-plugin equivalents as the index, and reads extraKnownMarketplaces from ~/.grok/settings.json or ~/.claude/settings.json.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok plugins guide marketplace is a catalog](../../study-results/Grok%20Build/2026-11-14%20grok%20plugins%20guide%20marketplace%20is%20a%20catalog.md)"
      - "[2026-11-14 grok plugins guide marketplace source kinds](../../study-results/Grok%20Build/2026-11-14%20grok%20plugins%20guide%20marketplace%20source%20kinds.md)"
      - "[2026-11-14 grok plugins guide marketplace index file](../../study-results/Grok%20Build/2026-11-14%20grok%20plugins%20guide%20marketplace%20index%20file.md)"
      - "[2026-11-14 grok plugins guide settings file locations](../../study-results/Grok%20Build/2026-11-14%20grok%20plugins%20guide%20settings%20file%20locations.md)"
      - "[2026-11-14 grok marketplace add forms](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20add%20forms.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide at 1.0.45 describes marketplaces, their sources, the index file and the Claude-compatible locations.
reportedIn:
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Grok Build Marketplace](Grok%20Build%20Marketplace.md)"
---

The 2026-08-08 statement rested on a third-party note that said Grok reads Claude Code marketplaces with no configuration. The plugins guide in the repository gives the primary text: the index is `.grok-plugin/marketplace.json`, and the `.claude-plugin/` equivalents and `~/.claude/settings.json` are accepted too. The guide does not use the words "zero-config", so the note is restated from what it says.
