---
"@osdlc/typed-git": minor
---

A conflict from `merge`, `rebase` or `rebaseContinue` carries
`rerereReplayed`, the paths git's rerere says it resolved from a recorded
resolution, when there are any. Under `rerere.autoUpdate=false` this is the
only positive word that a path was replayed: it stays unmerged in the index,
and a binary or `-merge` conflict rerere never tracks is also absent from
`git rerere remaining`.
