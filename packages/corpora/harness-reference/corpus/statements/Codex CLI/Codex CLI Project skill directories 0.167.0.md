---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - .agents/skills
      - .codex/skills
    scope: each directory from the working directory up to the repository root
    note: .codex/skills is read from each .codex folder on that walk. A .codex folder in an untrusted project still adds its skills folder, though its config is ignored.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-10 Codex CLI Project skill directories agents folder source](../../study-results/Codex%20CLI/2026-11-10%20Codex%20CLI%20Project%20skill%20directories%20agents%20folder%20source.md)"
      - "[2026-11-10 Codex CLI Project skill directories project layers source](../../study-results/Codex%20CLI/2026-11-10%20Codex%20CLI%20Project%20skill%20directories%20project%20layers%20source.md)"
      - "[2026-11-10 Codex CLI Project skill directories codex folder source](../../study-results/Codex%20CLI/2026-11-10%20Codex%20CLI%20Project%20skill%20directories%20codex%20folder%20source.md)"
      - "[2026-11-10 Codex CLI Project skill directories untrusted project test](../../study-results/Codex%20CLI/2026-11-10%20Codex%20CLI%20Project%20skill%20directories%20untrusted%20project%20test.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Project skill directories 0.162.0](Codex%20CLI%20Project%20skill%20directories%200.162.0.md)"
---

Codex 0.167.0 reads both folders. The docs name only `.agents/skills`.

- `.agents/skills`: `repo_agents_skill_roots` checks `.agents/skills` in each directory from the
  project root down to the working directory.
- `.codex/skills`: `discover_project_layers` adds a project config layer for each `.codex` folder
  on the same walk. `roots_from_layer_stack` adds `<.codex>/skills` as a Repo root for each
  project layer.
- Trust: an untrusted `.codex` folder stays in the layer stack as a disabled layer, and
  `roots_from_layer_stack` reads every layer, disabled ones included. The test
  `layer_roots_preserve_scope_precedence_and_disabled_projects` expects an untrusted project's
  `.codex/skills` among the Repo roots. Only the executor-local config read
  (`loader/local.rs`, `append_project_layers`) drops untrusted layers, and skills do not use it.

The project root is found by `project_root_markers`, `.git` by default, so it is the repository
root unless the markers are changed.
