---
"@osdlc/config-layers": patch
---

`resolveConfigPath` joins `~/x` onto the home by the platform's path rules.
On Windows it gave `C:\Users\me/x` before; it now gives `C:\Users\me\x`.
