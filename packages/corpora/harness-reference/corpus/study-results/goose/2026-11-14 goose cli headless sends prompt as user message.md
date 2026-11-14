---
kind: source
reportedIn:
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/session/mod.rs#L1335-L1336 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: "pub async fn headless(&mut self, prompt: String) -> Result<()> { let message = Message::user().with_text(&prompt);"
  prefix: "ocess a single message and exit "
  suffix: " let result = self .process_mess"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> pub async fn headless(&mut self, prompt: String) -> Result<()> { let message = Message::user().with_text(&prompt);
