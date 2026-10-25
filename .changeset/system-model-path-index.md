---
"@osdlc/system-model": patch
---

Detection and file listing find the files a pattern can match by basename or depth, instead of testing every pattern against every listed file. On a repository of 30,000 files, detection took about 1.2 s and now takes about 0.4 s, and reading the cache takes about half as long. What matches is unchanged.

`runners.readCached` now stops when `options.signal` aborts, before it hashes the next runner's files, and rejects with the abort reason. Before, it read on to the end, or, if a listing was aborted, answered with every runner a miss.
