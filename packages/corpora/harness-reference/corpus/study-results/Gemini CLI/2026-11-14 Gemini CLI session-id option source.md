---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/config/config.ts#L440-L446 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30
excerpt:
  exact: "description: 'Start a new session with a manually provided UUID.', coerce: (value: string): string => { const trimmed = value.trim(); if (!trimmed) { throw new Error('The --session-id option cannot be empty.'); } if (!/^[a-zA-Z0-9-_]+$/.test(trimmed)) {"
  prefix: "d', { type: 'string', nargs: 1, "
  suffix: " throw new Error( 'Invalid sessi"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> description: 'Start a new session with a manually provided UUID.', coerce: (value: string): string => { const trimmed = value.trim(); if (!trimmed) { throw new Error('The --session-id option cannot be empty.'); } if (!/^[a-zA-Z0-9-_]+$/.test(trimmed)) {
