---
"@osdlc/repo-cleaner": patch
---

`defaultProcessProbe().holders(path)` now counts a process whose working directory was removed, which Linux's `lsof` lists as `<path> (deleted)`, as working in `path` while nothing is at `path` again.
