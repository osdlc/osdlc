---
'@osdlc/typed-gh': patch
---

`searchPrs`, and `prList` with `search`, report `truncated: true` when 1000 rows come back. GitHub search returns at most 1000 results whatever the `limit`, so before, a `limit` of 1000 or more read as complete (`truncated: false`) while more pull requests matched. A list that does not search is unchanged.
