---
"@osdlc/path-guard": patch
---

Fix the containment layer on Windows, which read only POSIX paths. There, `resolveInside` and `contains` did not see a symlink that leads out of the root, and so accepted it. They now read `\` as a separator and a drive or UNC share as a root, and fold `..` as text before following a link, as Node and Windows do. `nodeResolver` uses `realpathSync.native` on Windows. On Windows, `resolveInside`, `canonicalExistingPrefix` and `realpathOrSelf` return paths with `\` separators, and `existingPathInside` gives `relativePath` with `/` separators, as on POSIX. Nothing changes on Linux or macOS. Windows is now tested in CI, and the README lists its limits.
