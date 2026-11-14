---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/live-reload
  object:
    supported: true
    catalog: rebuilt from disk each time the system prompt is assembled for an inference
    body: read from disk on every load_skill call and every /<skill-name> command
    restart_needed: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill catalog discovered per prompt](../../study-results/goose/2026-11-14%20goose%20skill%20catalog%20discovered%20per%20prompt.md)"
      - "[2026-11-14 goose machine collects prompt per inference](../../study-results/goose/2026-11-14%20goose%20machine%20collects%20prompt%20per%20inference.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The skill list in the prompt comes from a fresh discovery, collected before each inference.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill load discovers from disk](../../study-results/goose/2026-11-14%20goose%20skill%20load%20discovers%20from%20disk.md)"
      - "[2026-11-14 goose skill slash command resolve](../../study-results/goose/2026-11-14%20goose%20skill%20slash%20command%20resolve.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Loading a skill discovers the skills again and reads the file.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin skills at startup](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20skills%20at%20startup.md)"
    directionOfEvidenceProvided: neutral
    description: The skills guide says plugin skills are discovered at session startup.
reportedIn:
  - "[aaif-goose goose ops_skills.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_skills.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-agent machine.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20machine.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skill_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skill_slash_command.rs%20at%202365bc5.md)"
  - "[aaif-goose goose using-skills.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-skills.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Skill edits mid-session](../../subjects/skills/Skill%20edits%20mid-session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Not confirmed by a run. The docs say plugin skills are discovered at session startup.
---

The source discovers skills from disk for every prompt and every load, so an added or edited skill is seen without a restart. This is read from the source, not from a run.
