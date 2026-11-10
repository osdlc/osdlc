---
kind: source
reportedIn:
  - "[google-gemini gemini-cli CLI source at 3fd7d26](../../documents/github.com/google-gemini%20gemini-cli%20CLI%20source%20at%203fd7d26.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
observed: 2026-11-05
locator: packages/cli/src/config/extension-manager.ts:1087-1122, 1510-1516; packages/cli/src/commands/extensions/validate.ts:36-193 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@gemini-cli#observation-1
---

Imported from `facts/gemini-cli/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "a missing name or version, a name with characters other than letters, digits and dashes, or malformed JSON fails the load and the extension is not installed; other field types are not checked at load"
- validator: "gemini extensions validate <path>"
- validator_checks: "context files exist and stay inside the extension; version is semver (warning); mcpServers is an object and each server names a transport (command, url, httpUrl or tcp) and has a valid URL; httpUrl is deprecated (warning)"
