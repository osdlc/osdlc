---
kind: source
reportedIn:
  - "[block goose open_plugins.rs at 4facf56](../../documents/github.com/block%20goose%20open_plugins.rs%20at%204facf56.md)"
harness: "[goose](../../harnesses/goose.md)"
observed: 2026-11-05
locator: crates/goose/src/plugins/formats/open_plugins.rs:69-100, 155-170, 204-250, 254-270, 345-412 at 4facf56cbab049142809d9afa4648ebe6823ba80
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@goose#observation-1
---

Imported from `facts/goose/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "install fails: a manifest that does not parse, a name outside 1-64 lowercase letters, digits, dashes and periods, a skills or mcpServers path that is not a string, does not start with dot-slash or leaves the plugin, a non-boolean exclusive, or an invalid MCP server document"
