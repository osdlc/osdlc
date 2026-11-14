---
number: 79
title: Markdown after the move
detail: clean up osdlc/markdown
status: todo
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[78 Bring in profiles](78%20Models%20repo%20setup.md)"
  - "[60 Publish claims](60%20Publish%20claims.md)"
---

Clean up osdlc/markdown once the plan, the profiles and the starter live in osdlc/osdlc ([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)).
Close osdlc/markdown [#15](https://github.com/osdlc/markdown/pull/15),
[#16](https://github.com/osdlc/markdown/pull/16) and [#19](https://github.com/osdlc/markdown/pull/19),
and [osdlc/models#1](https://github.com/osdlc/models/pull/1), as moved, and link the osdlc/osdlc pull
request in each. Remove from osdlc/markdown what was brought to osdlc/osdlc, so there is one copy.
Its README stays, as the holding pen's. In osdlc/osdlc, change the fernlog example (from
[#16](https://github.com/osdlc/markdown/pull/16), now at `packages/corpora/examples/fernlog/`) to
install `@osdlc/corpus-profile-claims` from npm instead of by path. After 78 and 60.
