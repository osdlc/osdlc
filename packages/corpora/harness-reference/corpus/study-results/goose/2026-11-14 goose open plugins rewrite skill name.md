---
kind: source
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/plugins/formats/open_plugins.rs#L101-L103 at 2365bc5e898a38133c373eef2d1357416acd66e2 (install_from_manifest)
excerpt:
  exact: let namespaced_name = namespaced_component_name(&plugin_name, &skill.name); let staged_skill_dir = staged_destination.join(&skill.relative_directory); rewrite_skill_name(&staged_skill_dir.join("SKILL.md"), &namespaced_name)?;
  prefix: "c::new(); for skill in skills { "
  suffix: " imported_skills.push(ImportedSk"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let namespaced_name = namespaced_component_name(&plugin_name, &skill.name); let staged_skill_dir = staged_destination.join(&skill.relative_directory); rewrite_skill_name(&staged_skill_dir.join("SKILL.md"), &namespaced_name)?;
