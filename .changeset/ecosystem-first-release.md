---
'@osdlc/ecosystem': minor
---

First release. `@osdlc/ecosystem` holds the settings every osdlc tool shares, one module per concern.

- The package entry gives the family's directories: `OSDLC_VENDOR_DIRS` (`osdlc`, moved by `OSDLC_ROOT` and `OSDLC_<HOME>_DIR`) and `osdlcDirs()`, pinned to the Xdg convention, so `~/.config/osdlc` on Linux and macOS.
- `@osdlc/ecosystem/repositories` reads and writes `repositories.yaml` in the osdlc config home. Its `roots` list the directories that hold a person's checkouts. `repositoriesFile()` is the handle: `OSDLC_REPOSITORIES` moves the file and must be absolute, the schema is strict, and `writeRoots(roots, { etag })` is a compare-and-swap that edits only the `roots` value, and throws `WriteConflictError` (re-exported from `@osdlc/etag-write`) when the file changed since it was read.
- `resolveRoots()` gives the roots to scan. An absolute entry or one starting `~` is a root, a relative entry is dropped with a warning naming the file, a missing directory is skipped, and `roots: []` scans nothing. With no file or no `roots`, `defaultRoots()` uses the directory that holds the caller's main checkout, or the one above it when that directory is named after the owner in the caller's `origin`. It never steps to or above the home directory.
- `CheckoutLocator` and `locateCheckout('owner/name')` find every checkout whose `origin` names a repository, through `@osdlc/typed-git`'s `discoverCheckouts`, `readRemote` and `sameRepo`. Each repository's main checkout is returned once, linked worktrees included. A locator scans the roots once for all its targets, and gives the roots it searched, the file's path, and `depthLimited`, the directories the walk left unopened at `maxDepth`, for a caller's messages. git never searches upward from a directory the walk found, so a broken `.git` cannot answer with the repository around a root.
