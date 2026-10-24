---
'@osdlc/cli-tool': patch
---

Declare `zod` (`^4`) as a peer dependency. Parts of cli-tool load `@osdlc/config-layers`, which needs zod. cli-tool did not declare it, so consumers had to find and install it themselves.
