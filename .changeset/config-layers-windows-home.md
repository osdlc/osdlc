---
"@osdlc/config-layers": patch
---

`resolveConfigPath` joins `~/x` onto the home by the platform's path rules.
On Windows it gave `C:\Users\me/x` before; it now gives `C:\Users\me\x`. On
macOS and Linux the joined path is now folded as `path.join` folds it. With a
home of `/home/me`, `~/./x` and `~//x` give `/home/me/x` and `~/../x` gives
`/home/x`; with a home of `/home/me/`, `~/x` gives `/home/me/x`. Before, the
parts were kept as written.
