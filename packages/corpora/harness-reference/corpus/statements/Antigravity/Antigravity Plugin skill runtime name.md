---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: acme-tools:review
    namespace: "<plugin>:"
    bare_alias: the Plugins page shows a plugin skill run as /<skill-name>, such as /hello
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 discovery plugin skill names](../../study-results/Antigravity/2026-11-14%20discovery%20plugin%20skill%20names.md)"
      - "[2026-11-14 changelog plugin skill double prefix](../../study-results/Antigravity/2026-11-14%20changelog%20plugin%20skill%20double%20prefix.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Customization discovery page and the 1.2.7 changelog give the <plugin>:<skill> form.
  - hasEvidenceItems:
      - "[2026-11-14 plugins skill slash command](../../study-results/Antigravity/2026-11-14%20plugins%20skill%20slash%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Plugins page shows a plugin skill invoked by its bare name.
reportedIn:
  - "[Antigravity docs Customization discovery](../../documents/antigravity.google/Antigravity%20docs%20Customization%20discovery.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
  - "[Antigravity docs Plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Plugins%20antigravity.google.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the bare /review also run a plugin skill, or only /acme-tools:review?
  - Does the prefix come from the manifest name or from the plugin folder?
---

The Customization discovery page says a plugin skill is named `<plugin>:<skill>`, and the changelog writes the slash command as `/<plugin>:<skill>`. The Plugins and Build plugins pages show the bare `/<skill-name>` form. The sources do not reconcile the two.
