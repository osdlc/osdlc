---
kind: docs
reportedIn:
  - "[Agent Skills how to add skills support to your agent](../../documents/agentskills.io/Agent%20Skills%20how%20to%20add%20skills%20support%20to%20your%20agent.md)"
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
observed: 2026-11-04
locator: Handling name collisions
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/duplicate-names@agent-skills#observation-1
---

Imported from `facts/agent-skills/skills/duplicate-names.md`, observation 1.

- across_scopes: "project-level overrides user-level (universal convention)"
- within_scope: "first-found or last-found, pick one and be consistent"
- collision: "log a warning that a skill was shadowed"

Implementer guide, not the normative spec.
