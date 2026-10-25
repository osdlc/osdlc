---
"@osdlc/system-model": patch
---

Detection and file listing find the files a pattern can match by basename or depth, instead of testing every pattern against every listed file. On a repository of 30,000 files, detection took about 1.2 s and now takes about 0.4 s, and reading the cache takes about half as long. What matches is unchanged.
