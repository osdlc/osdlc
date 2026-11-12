---
number: 79
title: Markdown after the move
detail: clean up osdlc/markdown
status: todo
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[78 Models repo setup](78%20Models%20repo%20setup.md)"
  - "[60 Publish claims](60%20Publish%20claims.md)"
---

Clean up osdlc/markdown once the profiles and the starter live in osdlc/models. Close
[#15](https://github.com/osdlc/markdown/pull/15) and [#19](https://github.com/osdlc/markdown/pull/19)
as moved, and link the osdlc/models pull request in each. Remove the traces of those folders from
osdlc/markdown's docs. Change the fernlog example
([#16](https://github.com/osdlc/markdown/pull/16)) to install `@osdlc/corpus-profile-claims` from
npm instead of by path. After 78 and 60.
