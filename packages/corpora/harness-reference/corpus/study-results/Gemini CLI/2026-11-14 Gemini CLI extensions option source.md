---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/config/config.ts#L394-L400 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30
excerpt:
  exact: ".option('extensions', { alias: 'e', type: 'array', string: true, nargs: 1, description: 'A list of extensions to use. If not provided, all extensions are used.',"
  prefix: "oerce: coerceCommaSeparated, }) "
  suffix: " coerce: coerceCommaSeparated, }"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .option('extensions', { alias: 'e', type: 'array', string: true, nargs: 1, description: 'A list of extensions to use. If not provided, all extensions are used.',
