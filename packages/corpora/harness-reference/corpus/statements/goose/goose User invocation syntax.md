---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/user-invocation
  object:
    syntax: /<skill-name> [arguments]
    also: /skills <name>... in the CLI, or asking for the skill by name
    effect: the skill content, with the arguments applied, is sent to the model as a hidden user message
    note: The name is matched without case. A built-in command or a recipe command of the same name wins.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill slash command resolve](../../study-results/goose/2026-11-14%20goose%20skill%20slash%20command%20resolve.md)"
      - "[2026-11-14 goose slash command builtin or recipe first](../../study-results/goose/2026-11-14%20goose%20slash%20command%20builtin%20or%20recipe%20first.md)"
      - "[2026-11-14 goose skill slash command hidden message](../../study-results/goose/2026-11-14%20goose%20skill%20slash%20command%20hidden%20message.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A slash command that names a skill loads it with the rest of the text as arguments, as a user message hidden from the user.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs skills command](../../study-results/goose/2026-11-14%20goose%20docs%20skills%20command.md)"
      - "[2026-11-14 goose docs skills slash command](../../study-results/goose/2026-11-14%20goose%20docs%20skills%20slash%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs describe /skills <name>... and asking for a skill.
reportedIn:
  - "[aaif-goose goose skill_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skill_slash_command.rs%20at%202365bc5.md)"
  - "[aaif-goose goose ops_skills.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_skills.rs%20at%202365bc5.md)"
  - "[aaif-goose goose using-skills.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-skills.md%20at%202365bc5.md)"
  - "[aaif-goose goose goose-cli-commands.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-cli-commands.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[User invocation syntax](../../subjects/skills/User%20invocation%20syntax.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A user runs a skill by typing `/<skill-name>`, with optional arguments after a space.
