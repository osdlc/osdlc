---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/duplicate-names
  object:
    behavior: one skill is kept and the others are shadowed
    order:
      - ~/.gemini/antigravity-cli/skills and ~/.gemini/skills (CLI only)
      - the personal folder inside the repository
      - the workspace, with the manifests in its .agents folders
      - ~/.gemini/config, with personal manifests
      - built-in skills
    plugin_skills: named <plugin>:<skill>, so they do not collide with other skills
    within_root: in a plugin skills folder the earlier skill is kept and the later one skipped; agy plugin validate warns
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 discovery which skill wins](../../study-results/Antigravity/2026-11-14%20discovery%20which%20skill%20wins.md)"
      - "[2026-11-14 discovery priority list](../../study-results/Antigravity/2026-11-14%20discovery%20priority%20list.md)"
      - "[2026-11-14 discovery cli skill folders win](../../study-results/Antigravity/2026-11-14%20discovery%20cli%20skill%20folders%20win.md)"
      - "[2026-11-14 discovery plugin skill names](../../study-results/Antigravity/2026-11-14%20discovery%20plugin%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Customization discovery page gives the priority order.
  - hasEvidenceItems:
      - "[2026-11-14 changelog validate skills](../../study-results/Antigravity/2026-11-14%20changelog%20validate%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.4.1 changelog says a later same-named skill in a plugin is skipped.
  - hasEvidenceItems:
      - "[2026-11-14 plugins skill slash command](../../study-results/Antigravity/2026-11-14%20plugins%20skill%20slash%20command.md)"
    directionOfEvidenceProvided: neutral
    description: The Plugins page shows a plugin skill run by its bare /<skill-name>, which does not fit the <plugin>:<skill> naming in `plugin_skills`. The disagreement is recorded on the Plugin skill runtime name statement.
reportedIn:
  - "[Antigravity docs Customization discovery](../../documents/antigravity.google/Antigravity%20docs%20Customization%20discovery.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
  - "[Antigravity docs Plugins](../../documents/antigravity.google/Antigravity%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Antigravity Duplicate skill names open](Antigravity%20Duplicate%20skill%20names%20open.md)"
---

`order` runs from highest to lowest priority. The two CLI-only folders win over everything else, and a manifest `exclude` list does not hide them.

`plugin_skills` follows the Customization discovery page. The Plugins page shows a plugin skill run by its bare name; see Plugin skill runtime name, which is disputed.
