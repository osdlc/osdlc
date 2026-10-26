---
'@osdlc/code-host': minor
---

Behaviour change: the GitHub auth checks' `remote` check now accepts the same hosts host selection does: `github.com` or a subdomain of it (`ssh.github.com`), in any case. Before, only exactly `github.com` passed, so an `ssh://git@ssh.github.com:443/...` origin was routed to GitHub but failed its own check. A GitHub Enterprise host, a lookalike such as `notgithub.com` and a URL that only mentions `github.com` in its path still fail.
Behaviour change (stricter): `parsePrInput` reads `owner/repo#N` through `@osdlc/typed-gh`'s `parsePrRef`, so the slug is held to typed-gh's rule. An owner that starts with `_`, `.` or `-` is now refused (null) where it used to be accepted.
