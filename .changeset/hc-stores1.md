---
"@osdlc/workstation-cleaner": minor
---

Ship descriptors for eight stores on their default folders: pnpm, uv, Hugging Face Hub, Gradle, npm, pip, Yarn and Maven. Maven's local repository, Hugging Face models and Gradle wrapper distributions are held: they go only when picked.

A `plugins.<name>.idleHours` the user sets now wins over a descriptor entry's own `idleHours`, and a top-level `idleHours` can only raise it; `config` prints each such entry's threshold. `@osdlc/workstation-cleaner/testing` adds `fakeProcesses` and `ageTree`.
