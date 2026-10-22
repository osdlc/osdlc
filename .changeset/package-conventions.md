---
'@osdlc/agent-call': patch
'@osdlc/cli-tool': patch
'@osdlc/code-host': patch
'@osdlc/color': patch
'@osdlc/command-seam': patch
'@osdlc/config-layers': patch
'@osdlc/detect-harness': patch
'@osdlc/etag-write': patch
'@osdlc/frontmatter-lossless': patch
'@osdlc/gfm-table': patch
'@osdlc/intersect': patch
'@osdlc/markdown-contract': patch
'@osdlc/observe': patch
'@osdlc/path-guard': patch
'@osdlc/pr-update': patch
'@osdlc/prettier-config': patch
'@osdlc/tiered-dirs': patch
'@osdlc/trust-repo': patch
'@osdlc/tsconfig': patch
'@osdlc/typed-gh': patch
'@osdlc/typed-git': patch
'@osdlc/yaml-splice': patch
---

Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.

- `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
- `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
- `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
- Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
- `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
- `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
