---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/description-match
  object:
    model_picks_from_description: true
    advice: put the key use case first; include keywords users would say
    troubleshooting_advice: check the description includes keywords users would naturally say
    malformed_yaml: skill body loads with empty metadata so Claude cannot match the description; /skill-name still works
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill picked from its description](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20picked%20from%20its%20description.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill picked from its description 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20picked%20from%20its%20description%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skill picked from its description 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skill%20picked%20from%20its%20description%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skill picked from its description](../../subjects/skills/Skill%20picked%20from%20its%20description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Do the docs give a measured reliability for description-only selection, or name a model it was tuned for?
imported_from: fact:skills/description-match@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/description-match.md`.

Open questions:
- Do the docs give a measured reliability for description-only selection, or name a model it was tuned for?
