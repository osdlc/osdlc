---
"@osdlc/command-seam": minor
---

New `absolutePathEntries(path, { platform })`: a `PATH` value with only the
entries a lookup with `absolutePathOnly` searches, to pass as a child's `PATH`
when the child looks programs up itself in a folder someone else wrote, as git
does for `ssh`, a `!` credential helper or `gpg`. A relative or empty entry is
dropped, and on Windows a drive-relative one. With no absolute entry left it
gives `/usr/bin:/bin` on POSIX, never an empty `PATH`, which a shell reads as
the current folder.
