---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: false
    equivalent: policy.allow_implicit_invocation in agents/openai.yaml beside SKILL.md, default true
    effect: when false, Codex does not invoke the skill implicitly; explicit $skill invocation still works
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter struct source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20struct%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the parser lists every frontmatter key it keeps, and this key is not among them. A listing is evidence of absence, one step below its kind."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill sidecar policy source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20sidecar%20policy%20source.md)"
      - "[2026-11-14 Codex CLI Skill sidecar file name source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20sidecar%20file%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2: the setting lives in the sidecar file."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill implicit invocation policy docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20implicit%20invocation%20policy%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
  - "[openai codex skills src metadata.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20metadata.rs%20at%20ce21072.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Codex has no frontmatter field for this. The same control is `policy.allow_implicit_invocation` in the skill's `agents/openai.yaml`. The statement is moderate because `supported: false` rests on the parser's field list.
