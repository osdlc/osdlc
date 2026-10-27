---
'@osdlc/repo-cleaner': minor
---

Output change: a remote on a host other than github.com is now named `host/owner/name` in the report, read with typed-git's `parseRemoteRepo`. Before, typed-gh read `owner/name` from any host, so one `owner/name` on two hosts was reported as a duplicate checkout. The `slug` field of `--output json` changes with it.
