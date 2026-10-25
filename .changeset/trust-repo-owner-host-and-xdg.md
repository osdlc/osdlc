---
'@osdlc/trust-repo': patch
---

Two security fixes.

- `policy.owners` now matches the host as well as the owner. An entry is `host/owner` (`gitlab.com/my-org`) or a bare `owner`, which means `github.com/owner`. Before, `my-org` also trusted a clone from `gitlab.com/my-org`. Your `ownerOf` should return `host/owner`; a bare owner it returns is read as a GitHub owner, which keeps an older `ownerOf` working for GitHub remotes.
- `xdgHome`, and so `trustStoreDir`, now ignores a relative XDG variable, as the XDG spec says, and uses the fallback under `home`. A relative `XDG_STATE_HOME` used to resolve against the cwd, which put the trust store inside whatever directory the tool ran in.
