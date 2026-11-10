---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/duplicate-names
  object:
    behavior: higher-priority location overrides lower
    order:
      - .grok/skills (cwd)
      - <repo_root>/.grok/skills
      - ~/.grok/skills and ~/.claude/skills
      - project .claude and .cursor skills rank high
    plugin_skill: does not override a native skill; stays available as plugin:name
    builtin_collision: both stay invocable, skill advertised under a scope-qualified name such as /user:commit
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Grok Build Duplicate skill names](../../study-results/Grok%20Build/2026-11-04%20Grok%20Build%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Within one tier, which of .grok/skills, .agents/skills and .claude/skills wins a name clash?
imported_from: fact:skills/duplicate-names@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/skills/duplicate-names.md`.

Open questions:
- Within one tier, which of .grok/skills, .agents/skills and .claude/skills wins a name clash?
