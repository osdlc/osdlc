---
"@osdlc/harness-knowledge": minor
---

Add `HARNESS_SLUGS`, `slugFor` and `idFor` to map the short harness ids other packages use
(`claude`, `copilot`, `deepseek`) to the file's slugs and back. Add `credentialEnv` and
`configDirEnv`, which return the environment variables the file states for a harness's
credentials and config folder.
