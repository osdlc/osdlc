---
'@osdlc/typed-git': patch
---

`parseRemoteRepo` reads `ssh.github.com` (GitHub's SSH over port 443) and `www.github.com` as `github.com`, so a remote on either names the same repository as one on `github.com`.
