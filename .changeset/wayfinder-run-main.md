---
"@osdlc/wayfinder": minor
---

`way` now runs through `@osdlc/cli-tool`'s `runMain`, as the other osdlc CLIs do, and answers `way --where`: the file that is running, the checkout or install it belongs to, and which devlink layer chose it. `way --where --json` prints the same facts as one object. `bin/way.js` and a checkout's `src/cli.ts` both call the new `runWay()`, so a handed-off checkout answers the same way.

Behaviour changes:

- `way dev …` is answered by the `way` you ran, not handed off to the linked checkout first. So `way dev off` and `way dev use` work even when the linked checkout is broken. Run a checkout's own `dev` (`node bin/way.js dev install` in it, as before) for verbs that need that checkout as `self`.
- `way dev …` is answered by cli-tool's devlink hook, as every other tool's `dev` is, so `dev` must be the first word. Flags before it are no longer accepted: write `way dev status --json`, not `way --json dev status`.
- An error no command caught, when it is a classified failure (such as a missing tool), now exits with that failure's code instead of always 1. It is still terminal-safe on stderr.
