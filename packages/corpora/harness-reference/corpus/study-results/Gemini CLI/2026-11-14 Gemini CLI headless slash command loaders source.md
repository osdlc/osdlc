---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src nonInteractiveCliCommands.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20nonInteractiveCliCommands.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/nonInteractiveCliCommands.ts#L43-L50 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (handleSlashCommand)
excerpt:
  exact: const commandService = await CommandService.create( [ new BuiltinCommandLoader(config), new McpPromptLoader(config), new FileCommandLoader(config), ], abortController.signal, );
  prefix: "ed.startsWith('/')) { return; } "
  suffix: " const commands = commandService"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const commandService = await CommandService.create( [ new BuiltinCommandLoader(config), new McpPromptLoader(config), new FileCommandLoader(config), ], abortController.signal, );
