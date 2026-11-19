---
kind: source
reportedIn:
  - "[dsh skill-filesystem package README](../../documents/github.com/dsh%20skill-filesystem%20package%20README.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
observed: 2026-11-04
locator: packages/skill/skill-filesystem/README.md:56 at fcc0ad46
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/discovery-walk@dsh#observation-1
---

Imported from `facts/dsh/skills/discovery-walk.md`, observation 1.

- project_root: "nearest ancestor containing .git, else the cwd"
- depth: "one level: <root>/<name>/SKILL.md or <root>/<name>.md; nested trees ignored"
- symlinks: "symlinked directories are discovered and their paths retained"
