---
'@osdlc/typed-gh': patch
---

`prList` always requests `number`, so a `fields` list without it no longer drops every row and returns an empty result.
