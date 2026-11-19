---
kind: source
reportedIn:
  - "[aaif-goose goose ops_skills.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_skills.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/state_machine/ops_skills.rs#L100-L101 at 2365bc5e898a38133c373eef2d1357416acd66e2 (execute_skill)
excerpt:
  exact: let args = params.args.as_deref(); let skills = crate::skills::discover_skills(Some(working_dir));
  prefix: "ll_name = params.name.as_str(); "
  suffix: " if let Some(skill) = skills.ite"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let args = params.args.as_deref(); let skills = crate::skills::discover_skills(Some(working_dir));
