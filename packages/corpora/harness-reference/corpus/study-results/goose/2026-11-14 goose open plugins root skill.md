---
kind: source
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/plugins/formats/open_plugins.rs#L307-L310 at 2365bc5e898a38133c373eef2d1357416acd66e2 (find_agent_skills)
excerpt:
  exact: if !plugin_dir.join("skills").is_dir() && skills_config.is_none() && plugin_dir.join("SKILL.md").is_file() {
  prefix: "in_dir, &root, &mut skills)?; } "
  suffix: " collect_skill_candidate(plugin_"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if !plugin_dir.join("skills").is_dir() && skills_config.is_none() && plugin_dir.join("SKILL.md").is_file() {
