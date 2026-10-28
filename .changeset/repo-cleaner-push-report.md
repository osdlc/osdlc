---
'@osdlc/repo-cleaner': patch
---

A remote branch delete the remote refuses now fails its step with git's reason and what it means, such as `[remote rejected] (pre-receive hook declined): A hook on the remote refused the push.`, read from typed-git's per-ref push report instead of stderr.
