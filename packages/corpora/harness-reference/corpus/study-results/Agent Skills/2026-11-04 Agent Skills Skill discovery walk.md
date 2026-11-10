---
kind: docs
reportedIn:
  - "[Agent Skills how to add skills support to your agent](../../documents/agentskills.io/Agent%20Skills%20how%20to%20add%20skills%20support%20to%20your%20agent.md)"
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
observed: 2026-11-04
locator: Step 1, Where to scan
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/discovery-walk@agent-skills#observation-1
---

Imported from `facts/agent-skills/skills/discovery-walk.md`, observation 1.

- scope_paths: [".agents/skills","~/.agents/skills","client-specific directories"]
- ancestor_dirs: "some implementations scan ancestor directories up to the git root"
- scan_bounds: "max depth 4-6 levels, max 2000 directories suggested"

Implementer guide; the spec does not mandate where skill directories live.
