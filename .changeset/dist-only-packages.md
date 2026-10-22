---
'@osdlc/cli-tool': patch
'@osdlc/code-host': patch
'@osdlc/command-seam': patch
'@osdlc/etag-write': patch
'@osdlc/gfm-table': patch
'@osdlc/pr-update': patch
'@osdlc/trust-repo': patch
'@osdlc/typed-gh': patch
'@osdlc/typed-git': patch
---

Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
