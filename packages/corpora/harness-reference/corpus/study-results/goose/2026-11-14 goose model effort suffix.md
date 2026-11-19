---
kind: source
reportedIn:
  - "[aaif-goose goose provider-types model.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20provider-types%20model.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-provider-types/src/model.rs#L374-L382 at 2365bc5e898a38133c373eef2d1357416acd66e2 (normalize_effort_suffix)
excerpt:
  exact: let effort = match last { "none" => ThinkingEffort::Off, "low" => ThinkingEffort::Low, "medium" => ThinkingEffort::Medium, "high" => ThinkingEffort::High, "xhigh" => ThinkingEffort::Max, _ => return, }; self.model_name = parts[..parts.len() - 1].join("-");
  prefix: "me(l) => *l, None => return, }; "
  suffix: " let has_explicit_effort = self "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let effort = match last { "none" => ThinkingEffort::Off, "low" => ThinkingEffort::Low, "medium" => ThinkingEffort::Medium, "high" => ThinkingEffort::High, "xhigh" => ThinkingEffort::Max, _ => return, }; self.model_name = parts[..parts.len() - 1].join("-");
