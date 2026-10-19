---
"@osdlc/markdown-contract": patch
---

`inferConfig` and `markdown-contract init` skip `.git` and `node_modules` folders, as `runCorpus` and `validate` already do. Before, they read `.md` files under those folders and inferred contracts from them.
