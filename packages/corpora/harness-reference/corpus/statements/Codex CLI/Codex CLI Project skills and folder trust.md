---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/project-trust
  object:
    supported: false
    detail: A .codex folder in an untrusted project still adds its skills folder, though its config is ignored. .agents/skills on the walk is added when the folder exists, with no trust check.
    user_skills_affected: false
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill roots every layer source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20every%20layer%20source.md)"
      - "[2026-11-14 Codex CLI Config layers include disabled source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Config%20layers%20include%20disabled%20source.md)"
      - "[2026-11-14 Codex CLI Skill roots project layer source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20project%20layer%20source.md)"
      - "[2026-11-10 Codex CLI Project skill directories untrusted project test](../../study-results/Codex%20CLI/2026-11-10%20Codex%20CLI%20Project%20skill%20directories%20untrusted%20project%20test.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2 and a test at rust-v0.167.0: skill roots come from every config layer, disabled ones included, and the test expects an untrusted project among them."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill roots repository walk source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20roots%20repository%20walk%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the .agents/skills walk tests only that the folder exists. No trust check there is evidence of absence, one step below its kind."
reportedIn:
  - "[openai codex ext skills src host_roots.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_roots.rs%20at%20ce21072.md)"
  - "[openai codex config src state.rs at ce21072](../../documents/github.com/openai%20codex%20config%20src%20state.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Project skills and folder trust](../../subjects/skills/Project%20skills%20and%20folder%20trust.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Project skills and folder trust open](Codex%20CLI%20Project%20skills%20and%20folder%20trust%20open.md)"
---

Codex 0.167.2 does not hold project skills back until the folder is trusted. Trust decides whether a project's `.codex/config.toml` applies, not whether its skills are listed.
