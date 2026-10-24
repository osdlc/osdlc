---
'@osdlc/cli-tool': minor
'@osdlc/config-layers': minor
---

`@osdlc/cli-tool`'s root import no longer loads `@osdlc/config-layers`' barrel, and through it yaml and zod. The root and devlink take the directory helpers from the new `@osdlc/config-layers/dirs` subpath and `closestMatches` / `didYouMean` from the new `@osdlc/config-layers/did-you-mean` subpath; the root's exports are unchanged. `@osdlc/cli-tool` also gains `./define-cli`, `./io`, `./prompt` and `./exit` subpaths, so a tool can import only what it uses.
