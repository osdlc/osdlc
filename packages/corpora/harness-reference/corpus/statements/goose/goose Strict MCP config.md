---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    strict_argv:
      - --no-profile
    ignores:
      - extensions enabled in the config
      - MCP servers of enabled plugins
    note: 'No config-file flag. Servers for the run are passed one by one: --with-extension "<command>" (stdio), --with-streamable-http-extension <URL>, --with-builtin <NAME>. --no-profile has no effect on a resumed session.'
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli no-profile flag](../../study-results/goose/2026-11-14%20goose%20cli%20no-profile%20flag.md)"
      - "[2026-11-14 goose cli with-extension flag](../../study-results/goose/2026-11-14%20goose%20cli%20with-extension%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definitions of --no-profile and --with-extension.
  - hasEvidenceItems:
      - "[2026-11-14 goose builder no-profile skips configured extensions](../../study-results/goose/2026-11-14%20goose%20builder%20no-profile%20skips%20configured%20extensions.md)"
      - "[2026-11-14 goose builder no-profile skips plugin servers](../../study-results/goose/2026-11-14%20goose%20builder%20no-profile%20skips%20plugin%20servers.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: With --no-profile the builder starts from an empty extension list and skips plugin MCP servers.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--no-profile` makes a new run use only the extensions given on the command line. There is no flag that takes an MCP config file.
