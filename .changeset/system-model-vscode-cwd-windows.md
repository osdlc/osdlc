---
'@osdlc/system-model': patch
---

On Windows, a VS Code task with `options.cwd` is no longer skipped as outside the repository. The check compared paths with `/` only, so a Windows root never matched and every task with a working folder (top-level `options.cwd` included) was dropped. It now resolves both paths with the platform's rules.
