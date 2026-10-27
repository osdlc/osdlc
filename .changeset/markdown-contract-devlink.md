---
'@osdlc/markdown-contract': minor
---

`markdown-contract dev` runs the tool from a development checkout: `dev link <checkout>` makes the installed command run that checkout's source, `dev status` says which code runs, and `dev off` goes back. `MARKDOWN_CONTRACT_HOME` does the same for one run. `@osdlc/cli-tool` is now a dependency, and the bin is `bin/markdown-contract.js`, which loads `dist/cli/bin.js`.
