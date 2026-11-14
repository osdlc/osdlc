---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src config extensions extensionEnablement.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extensions%20extensionEnablement.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/config/extensions/extensionEnablement.ts#L147-L148 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30
excerpt:
  exact: // If we have a single override called 'none', this disables all extensions. // Typically, this comes from the user passing `-e none`.
  prefix: "currentPath: string): boolean { "
  suffix: " if ( this.enabledExtensionNames"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // If we have a single override called 'none', this disables all extensions. // Typically, this comes from the user passing `-e none`.
