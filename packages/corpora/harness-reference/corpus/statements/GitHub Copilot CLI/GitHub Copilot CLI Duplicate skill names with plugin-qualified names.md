---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/duplicate-names
  object:
    result: first found wins; deduplicated by name
    order: project skill directories, personal skills, plugin skills directories, then COPILOT_SKILLS_DIRS and config
    across_scopes: project over personal
    plugin_dir: skills from a --plugin-dir plugin rank above personal skills of the same name (project > plugin-dir > personal > custom)
    plugin_clash: two plugins with a skill of the same name both load, under plugin-qualified names such as /my-plugin/search; the bare name goes to the higher-priority plugin
    built_in_skills: lowest priority; first found wins for duplicate names
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Duplicate skill names](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Duplicate%20skill%20names.md)"
      - "[2026-11-04 GitHub Copilot CLI Duplicate skill names 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Duplicate%20skill%20names%202.md)"
      - "[2026-11-04 GitHub Copilot CLI Duplicate skill names 3](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Duplicate%20skill%20names%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-04: the loading order and first found wins."
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin-qualified skill names docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin-qualified%20skill%20names%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference says same-name skills from two plugins coexist under plugin-qualified names.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI same-name plugin skills coexist changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20same-name%20plugin%20skills%20coexist%20changelog.md)"
      - "[2026-11-14 GitHub Copilot CLI plugin-dir skills precedence changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20plugin-dir%20skills%20precedence%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The changelog: 1.0.66 lets same-name skills from different plugins coexist, and 1.0.55 ranks --plugin-dir skills above personal ones."
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
  - "[Copilot docs CLI config directory reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20config%20directory%20reference.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[GitHub Copilot CLI Duplicate skill names](GitHub%20Copilot%20CLI%20Duplicate%20skill%20names.md)"
---

The 2026-11-04 statement gave the order and "first found wins" only. Two points are added. Skills of the same name from two plugins are not deduplicated: both load under plugin-qualified names (changelog 1.0.66, command reference). And skills from a plugin loaded with `--plugin-dir` rank above personal skills (changelog 1.0.55), which the docs table of locations does not show.
