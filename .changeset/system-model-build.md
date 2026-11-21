---
'@osdlc/system-model': minor
---

Add the `./build` entry: `walkManifests` finds every `package.json` and `Cargo.toml` under a directory and `buildDependencyGraph` turns them into a typed dependency graph. This is the TypeScript half of `@osdlc/manifest-graph`, which is folded into this package.
