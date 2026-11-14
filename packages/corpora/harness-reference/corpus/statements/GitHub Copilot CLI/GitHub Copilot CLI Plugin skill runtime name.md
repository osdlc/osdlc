---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/plugin-namespace
  object:
    namespace: none unless two plugins ship a skill with the same name; then `/acme-tools/review`
    namespace_from: the plugin
    bare_alias: the bare name routes to the higher-priority plugin
    note: the docs give the qualified form as `/my-plugin/search`; a frontmatter name may itself hold a colon, as in `my-plugin:search`
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin-qualified skill names docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin-qualified%20skill%20names%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference describes plugin-qualified names.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill name field docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20name%20field%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference allows colons in a name.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is the prefix the plugin manifest name, and is the qualified name also available when only one plugin ships the skill?
---

The docs describe a plugin-qualified name only for two plugins that ship the same skill name. They do not say which plugin value forms the prefix.
