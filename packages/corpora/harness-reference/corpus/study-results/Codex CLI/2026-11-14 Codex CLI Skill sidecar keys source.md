---
kind: source
reportedIn:
  - "[openai codex skills src metadata.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20metadata.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/skills/src/metadata.rs#L37-L44 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a (SkillMetadataFile)
excerpt:
  exact: "struct SkillMetadataFile { #[serde(default)] interface: Option<SkillInterfaceFile>, #[serde(default)] dependencies: Option<Dependencies>, #[serde(default)] policy: Option<Policy>, }"
  prefix: "e(Debug, Default, Deserialize)] "
  suffix: " #[derive(Debug, Default, Deseri"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> struct SkillMetadataFile { #[serde(default)] interface: Option<SkillInterfaceFile>, #[serde(default)] dependencies: Option<Dependencies>, #[serde(default)] policy: Option<Policy>, }
