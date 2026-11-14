---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    max_length: 64
    default: the skill folder's name
    note: The docs say SKILL.md must include name; the parser falls back to the folder name. A name over 64 characters stops the skill from loading.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter name default source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20name%20default%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter name length source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20name%20length%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter name and description checks source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20name%20and%20description%20checks%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter default name folder source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20default%20name%20folder%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter required fields docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20required%20fields%20docs.md)"
    directionOfEvidenceProvided: neutral
    description: "The docs state the authoring rule (name must be present). The loader is more lenient, so this line neither supports nor disputes required: false."
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src loader host.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20loader%20host.rs%20at%20ce21072.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A missing or empty `name` takes the name of the folder that holds SKILL.md. The length is counted in characters after whitespace is collapsed. A plugin skill gets its plugin prefix afterwards; that limit is under Skill name validation.
