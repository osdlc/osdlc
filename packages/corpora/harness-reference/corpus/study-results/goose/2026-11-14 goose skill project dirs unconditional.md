---
kind: source
reportedIn:
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/skills/mod.rs#L321-L334 at 2365bc5e898a38133c373eef2d1357416acd66e2 (all_skill_dirs_with_config)
excerpt:
  exact: 'if let Some(wd) = working_dir { for path in [ wd.join(".agents").join("skills"), wd.join(".goose").join("skills"), wd.join(".claude").join("skills"), ] { dirs.push(SkillDirectory { path, is_global: false, writable: true, preserve_path: false, }); } }'
  prefix: "th_config(working_dir, config); "
  suffix: " dirs.extend( plugin_dirs .iter("
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if let Some(wd) = working_dir { for path in [ wd.join(".agents").join("skills"), wd.join(".goose").join("skills"), wd.join(".claude").join("skills"), ] { dirs.push(SkillDirectory { path, is_global: false, writable: true, preserve_path: false, }); } }
