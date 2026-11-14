---
kind: source
reportedIn:
  - "[xai-org grok-build headless cli.rs](../../documents/github.com/xai-org%20grok-build%20headless%20cli.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-pager/src/headless/cli.rs:9-19 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: "pub enum OutputFormat { #[default] Plain, Json, /// NDJSON: one ACP session update per line, the agent's native format. #[value(name = \"streaming-json\")] StreamingJson, /// NDJSON in the Anthropic Messages API wire format. #[value(name = \"streaming-messages-json\")] StreamingMessagesJson, }"
  prefix: "ult, PartialEq, Eq, ValueEnum)] "
  suffix: " pub fn parse_json_schema(input:"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> pub enum OutputFormat { #[default] Plain, Json, /// NDJSON: one ACP session update per line, the agent's native format. #[value(name = "streaming-json")] StreamingJson, /// NDJSON in the Anthropic Messages API wire format. #[value(name = "streaming-messages-json")] StreamingMessagesJson, }
