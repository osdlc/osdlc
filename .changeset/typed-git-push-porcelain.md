---
"@osdlc/typed-git": minor
---

New `pushPorcelain(remote, refspec, { atomic, forceWithLease })` on `Git` and `AsyncGit`. It runs `git push --porcelain` and returns one result per ref: `{ src, dst, flag, summary, rejection?, rawReason, detail }`. A rejected ref comes back as a value with a typed `rejection` (`stale`, `non-fast-forward`, `already-exists`, `ref-conflict`, `lock-failed`, `hook-declined` or `other`), so you no longer read git's stderr to learn why a push failed. The reason is read from git's text, including the remote's `cannot lock ref` line, not from the local git version. So the old and new wordings, such as `(failed to update ref)` from older git and `(refname conflict)` from git 2.53 and 2.54, map to the same value. A failure that reaches no ref, such as an unknown remote, a network or auth problem, or a local pre-push hook, still throws the classified failure. `forceWithLease` also takes one lease per ref. `refspec` takes a list.
