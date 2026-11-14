---
kind: source
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/plugins/formats/open_plugins.rs#L447-L453 at 2365bc5e898a38133c373eef2d1357416acd66e2 (collect_skill_candidate)
excerpt:
  exact: let name = extract_skill_name(&raw).unwrap_or_else(|| { skill_dir .file_name() .and_then(|name| name.to_str()) .unwrap_or("unnamed") .to_string() });
  prefix: "::read_to_string(&skill_file)?; "
  suffix: " let relative_directory = skill_"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let name = extract_skill_name(&raw).unwrap_or_else(|| { skill_dir .file_name() .and_then(|name| name.to_str()) .unwrap_or("unnamed") .to_string() });
