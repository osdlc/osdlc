---
kind: source
reportedIn:
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/skills/mod.rs#L347-L350 at 2365bc5e898a38133c373eef2d1357416acd66e2 (all_skill_dirs_with_config)
excerpt:
  exact: 'let home = dirs::home_dir(); if let Some(h) = home.as_ref() { dirs.push(SkillDirectory { path: h.join(".agents").join("skills"),'
  prefix: "se, preserve_path: true, }), ); "
  suffix: " is_global: true, writable: true"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let home = dirs::home_dir(); if let Some(h) = home.as_ref() { dirs.push(SkillDirectory { path: h.join(".agents").join("skills"),
