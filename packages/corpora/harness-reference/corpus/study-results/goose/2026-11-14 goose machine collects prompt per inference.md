---
kind: source
reportedIn:
  - "[aaif-goose goose goose-agent machine.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20machine.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-agent/src/machine.rs#L176-L177 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: let input = self.collect_inference_input(session, conversation).await?; inference.infer(session, conversation, input, emit).await
  prefix: "rationResult::NotApplicable); } "
  suffix: " } } }; let result = tokio::sele"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let input = self.collect_inference_input(session, conversation).await?; inference.infer(session, conversation, input, emit).await
