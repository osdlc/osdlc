---
'@osdlc/cli-tool': patch
---

Declare `zod` (`^4`) as a peer dependency. The root import loads `@osdlc/config-layers`, which needs zod, so consumers had to discover and install it themselves.
