---
"@osdlc/typed-git": minor
---

`catFileBatch(names, { maxBytes, chunkBytes })` and `catFileBatchChunks` (on `Git` and `AsyncGit`) read many objects byte for byte through `git cat-file --batch`: one `--batch-check` for the sizes, then `--batch` for the blobs within `maxBytes`, in groups of about `chunkBytes`. Each name maps to `text`, `binary`, `too-large`, `not-blob` or `missing`.
