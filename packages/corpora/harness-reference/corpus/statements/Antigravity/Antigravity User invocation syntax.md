---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/user-invocation
  object:
    syntax: /<skill-name>
    also: name the skill in the prompt
    note: "plugin skills are named <plugin>:<skill>; `disable-slash-command: true` in the frontmatter hides a skill from the / menu"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 skills slash command conversion](../../study-results/Antigravity/2026-11-14%20skills%20slash%20command%20conversion.md)"
      - "[2026-11-14 skills mention by name](../../study-results/Antigravity/2026-11-14%20skills%20mention%20by%20name.md)"
      - "[2026-11-14 discovery plugin skill names](../../study-results/Antigravity/2026-11-14%20discovery%20plugin%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says each skill becomes a slash command.
  - hasEvidenceItems:
      - "[2026-11-14 changelog disable-slash-command](../../study-results/Antigravity/2026-11-14%20changelog%20disable-slash-command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.1.12 changelog adds the opt-out.
reportedIn:
  - "[Antigravity docs Agent skills](../../documents/antigravity.google/Antigravity%20docs%20Agent%20skills.md)"
  - "[Antigravity docs Customization discovery](../../documents/antigravity.google/Antigravity%20docs%20Customization%20discovery.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[User invocation syntax](../../subjects/skills/User%20invocation%20syntax.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

In the CLI every skill becomes a slash command named after it. In headless mode the same call works at the start of a `-p` prompt.
