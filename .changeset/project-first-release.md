---
'@osdlc/project': minor
---

First release. A model of what a repository contains: packages, ecosystems (node, rust, python, go, ruby, jvm, php, swift, deno) and tools, each tool described once as a `ToolDef` with the roles it plays (package manager, runner, tool manager, hook manager). `createProject({ tools })` binds tools into a registry; `detect` reads a repository from one file listing, with evidence for every claim; `runners.collect` lists the tasks of each detected runner, with installs, tool trust and git hooks as synthesized tasks; `runners.invoke` binds arguments per tool. Thirty-two built-in tools ship as plugin entries (`./node`, `./rust`, `./python`, `./jvm`, `./php`, `./swift`, `./ruby`, `./go`, `./deno`, `./runners`, `./tools`) and together as `./builtins`. Running a repository's own tools stays off unless `allowExec` is set. It replaces `@osdlc/detect-runners`.
