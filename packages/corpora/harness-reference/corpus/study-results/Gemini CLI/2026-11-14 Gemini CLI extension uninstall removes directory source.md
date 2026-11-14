---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/config/extension-manager.ts#L623-L627 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (uninstallExtension)
excerpt:
  exact: await removeDirectoryWithRetry(storage.getExtensionDir()); // The rest of the cleanup below here is only for true uninstalls, not // uninstalls related to updates. if (isUpdate) return;
  prefix: "th.basename(extension.path), ); "
  suffix: " this.extensionEnablementManager"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> await removeDirectoryWithRetry(storage.getExtensionDir()); // The rest of the cleanup below here is only for true uninstalls, not // uninstalls related to updates. if (isUpdate) return;
