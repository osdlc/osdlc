---
'@osdlc/typed-gh': patch
---

A list that goes through GitHub search reports `truncated: true` when 1000 rows come back. Search returns at most 1000 results whatever the `limit`, so before, a `limit` of 1000 or more read as complete (`truncated: false`) while more matched. gh uses search for `searchPrs`, for `prList` with a non-empty `search` or an `author`, and for `issueList` with a `label`. A list that does not search is unchanged. `searchPrs` now asks gh for at most 1000 rows: a `limit` of 1000 or more used to fail, because gh refuses a larger search limit.
