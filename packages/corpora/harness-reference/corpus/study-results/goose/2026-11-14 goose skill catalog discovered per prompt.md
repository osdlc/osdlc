---
kind: source
reportedIn:
  - "[aaif-goose goose ops_skills.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_skills.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/state_machine/ops_skills.rs#L62-L63 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: "fn skill_instructions(working_dir: &Path) -> Option<String> { let sources = crate::skills::discover_skills(Some(working_dir));"
  prefix: 'ed instructions.", schema, )) } '
  suffix: " let mut skills: Vec<&SourceEntr"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn skill_instructions(working_dir: &Path) -> Option<String> { let sources = crate::skills::discover_skills(Some(working_dir));
