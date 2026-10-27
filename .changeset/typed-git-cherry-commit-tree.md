---
'@osdlc/typed-git': minor
---

Add `cherry(upstream, head?)` and `commitTree(tree, { parents, message })` to `Git` and `AsyncGit`.

- `cherry` runs `git cherry` and returns `{ sha, equivalent }` per commit on `head` that `upstream` lacks. Output it cannot read throws instead of being skipped. `soft.cherry` falls back to `[]`.
- `commitTree` runs `git commit-tree` and returns the new commit's sha. It writes an object and no ref, and needs a git identity. A reply that is not a sha throws.
- Both refuse a leading-dash revision before spawning, like the other revision-taking verbs.
