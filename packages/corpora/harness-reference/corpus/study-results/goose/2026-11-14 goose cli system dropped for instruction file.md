---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L2115-L2123 at 2365bc5e898a38133c373eef2d1357416acd66e2 (parse_run_input)
excerpt:
  exact: "additional_system_prompt: None, }, None, ))) } (_, Some(text), _) => Ok(Some(( InputConfig { contents: Some(text.clone()), additional_system_prompt: input_opts.system.clone(),"
  prefix: "fig { contents: Some(contents), "
  suffix: " }, None, ))), (_, _, Some(recip"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> additional_system_prompt: None, }, None, ))) } (_, Some(text), _) => Ok(Some(( InputConfig { contents: Some(text.clone()), additional_system_prompt: input_opts.system.clone(),
