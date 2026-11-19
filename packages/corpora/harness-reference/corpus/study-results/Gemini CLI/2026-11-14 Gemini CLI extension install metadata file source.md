---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/config/extension-manager.ts#L475-L479 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (installOrUpdateExtension)
excerpt:
  exact: const metadataPath = path.join( destinationPath, INSTALL_METADATA_FILENAME, ); await fs.promises.writeFile(metadataPath, metadataString);
  prefix: "gify(installMetadata, null, 2); "
  suffix: " // Establish trust at point of "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const metadataPath = path.join( destinationPath, INSTALL_METADATA_FILENAME, ); await fs.promises.writeFile(metadataPath, metadataString);
