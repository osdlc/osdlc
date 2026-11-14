---
kind: source
reportedIn:
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/mod.rs#L151-L164 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: '#[serde(tag = "type", rename_all = "snake_case")] enum StreamEvent { Message { message: Message, }, Notification { extension_id: String, #[serde(flatten)] data: NotificationData, }, Error { error: String, }, Complete {'
  prefix: ", } #[derive(Serialize, Debug)] "
  suffix: " total_tokens: Option<i64>, #[se"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> #[serde(tag = "type", rename_all = "snake_case")] enum StreamEvent { Message { message: Message, }, Notification { extension_id: String, #[serde(flatten)] data: NotificationData, }, Error { error: String, }, Complete {
