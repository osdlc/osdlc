---
'@osdlc/typed-git': minor
---

**Breaking:** `push` and `pushPorcelain` are now one verb. `push(remote, refspec | refspecs, { atomic, delete, forceWithLease })` runs `git push --porcelain` and returns the `PushReport` that `pushPorcelain` returned, with one result per ref. A rejected ref no longer throws: check each ref's `flag`, or `report.refs.some((r) => r.flag === '!')`. A failure that reaches no ref still throws, as before. `pushPorcelain` and `PushPorcelainOptions` are removed; rename the call to `push`.

New `PUSH_REJECTIONS`: for every `PushRejection`, a one-line `message`, an `explanation`, a `hint` and a `docs` link into git's manual. The README's new "Rejection reference" section has the same text.

New rejection `atomic-failed` for the other refs of a failed `--atomic` push (`atomic push failed`, `atomic transaction failed`), which were `other`.

The push tests now also replay output recorded from git 2.47.3 and 2.56.0, before and after git 2.51 reworded the remote's reasons. `tests/fixtures/push/record-push.mjs` records a new version.
