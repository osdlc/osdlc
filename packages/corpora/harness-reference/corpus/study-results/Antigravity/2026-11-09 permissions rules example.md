---
kind: docs
reportedIn:
  - "[Antigravity docs Permissions and sandbox](../../documents/antigravity.google/Antigravity%20docs%20Permissions%20and%20sandbox.md)"
harness: "[Antigravity](../../harnesses/Antigravity.md)"
observed: 2026-11-09
locator: CLI configuration examples
excerpt:
  exact: '"allow": [ "command(git)", "command(regex:npm run (build|lint|test))", "read_file(/var/log/app)", "write_file(src/)", "read_url(google.com)", "mcp(linter/*)" ]'
  prefix: 's.json file: { "permissions": { '
  suffix: ', "deny": [ "command(rm -rf)", "'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T00:00:00Z
---

> "allow": [ "command(git)", "command(regex:npm run (build|lint|test))", "read_file(/var/log/app)", "write_file(src/)", "read_url(google.com)", "mcp(linter/*)" ]
