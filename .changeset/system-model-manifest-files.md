---
'@osdlc/system-model': minor
---

`./build` now exports `MANIFEST_FILES`, the manifest file names `walkManifests` reads (`package.json` and `Cargo.toml`). A caller that lists files another way, from a git tree for example, uses it to pick out the manifests.
