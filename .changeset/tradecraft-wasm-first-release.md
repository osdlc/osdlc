---
'@osdlc/tradecraft-wasm': minor
---

First release. The Tradecraft core, built to WebAssembly, for Node.js and Bun. It publishes a skill note to an agent's destination (`publishSkill`), reports what a publish would do (`statusOf`), scans a vault (`discoverComponents`), renders or checks a marketplace (`exportSkills`) and adopts published skills back into a vault (`adoptSkills`). `knownTargets()`, `canonicalTarget()`, `publishableKinds()` and `validateNamespace()` expose the core's vocabularies. The core decides everything: this package passes JSON across the boundary and turns a thrown core error into `CoreError`. `createNodeVfs()` gives the filesystem the core is handed, backed by `node:fs`, with the Windows path conversion. The request and report types are generated from the Rust source.
