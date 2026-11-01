---
"@osdlc/repo-cleaner": minor
---

`repo-cleaner cache` lists the clones `--remote-url` keeps, with their URL and size, and `cache remove <url>` or `cache remove --all` removes them, a clone left by a stopped run included. A checkout directory named `cache` is now swept as `./cache`. `apply`'s question no longer takes its answer from keys typed while the sweep ran (through `@osdlc/cli-tool`'s `askYesNo`). The README's install section covers a global install that the shell cannot find, fish with a Node version manager included.
