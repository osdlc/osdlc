---
'@osdlc/cli-tool': minor
'@osdlc/config-layers': minor
---

Importing `@osdlc/cli-tool` no longer loads yaml and zod. The root now takes its directory helpers from a new `@osdlc/config-layers/dirs` subpath, and `closestMatches` and `didYouMean` from a new `@osdlc/config-layers/did-you-mean` subpath. The root's exports are unchanged.

`@osdlc/cli-tool` also adds the subpaths `./define-cli`, `./io`, `./prompt` and `./exit`, so a tool can import only the parts it uses.
