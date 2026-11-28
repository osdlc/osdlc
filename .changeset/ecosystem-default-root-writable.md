---
"@osdlc/ecosystem": patch
---

`defaultRoots` gives no default root outside the home directory when the
folder that holds the caller's checkout, or the folder above it that would be
the root, can be written by others (`o+w`, sticky or not). A caller at
`/tmp/proj` used to get `/tmp`, where anyone can put a checkout whose `origin`
claims any repository. POSIX only.
