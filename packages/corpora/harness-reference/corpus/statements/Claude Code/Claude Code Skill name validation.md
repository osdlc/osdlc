---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/name-validation
  object:
    checks: "no hidden, control, private-use, unassigned, direction-changing or blank-like characters, no `<` or `>`, at most 256 characters; `synced` and `anthropic-skills` are reserved"
    length: up to 256
    must_match_directory: false
    on_failure: "a refused directory name outside a plugin: the skill does not load; a refused frontmatter `name`: the skill loads without it; in a plugin skill folder name the characters become hyphens; a reserved name does not load"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills name refused characters](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20refused%20characters.md)"
      - "[2026-11-14 docs errors name refused](../../study-results/Claude%20Code/2026-11-14%20docs%20errors%20name%20refused.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs list the characters Claude Code refuses in a name, and the startup notice adds the 256-character limit.
  - hasEvidenceItems:
      - "[2026-11-14 docs skills name refused directory](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20refused%20directory.md)"
      - "[2026-11-14 docs skills name refused frontmatter name](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20refused%20frontmatter%20name.md)"
      - "[2026-11-14 docs skills name plugin folder hyphens](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20plugin%20folder%20hyphens.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say what happens when a directory name, a frontmatter `name` or a plugin skill folder name is refused.
  - hasEvidenceItems:
      - "[2026-11-14 docs skills name reserved synced](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20reserved%20synced.md)"
      - "[2026-11-14 docs skills name reserved anthropic-skills](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20reserved%20anthropic-skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs name two reserved names.
  - hasEvidenceItems:
      - "[2026-11-14 docs skills name differs from directory](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20name%20differs%20from%20directory.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs give a skill whose `name` differs from its directory name.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
  - "[Claude Code docs error reference](../../documents/code.claude.com/Claude%20Code%20docs%20error%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Whether a failed check blocks loading depends on where the name is, so `blocking` is left out and
`on_failure` says it in words. The docs list refused characters "such as these", so the list may not
be complete. They state no rule about case, hyphens or colons in a name.
