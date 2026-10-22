---
"@osdlc/typed-git": minor
---

A git failure with an HTTP status is no longer `remote-unreachable`. `unable to access … The requested URL returned error: 401` or `403` is `not-authenticated`, and `404` is the new kind `not-found` (`GitFailureKind` gains it), so a script that retries on `remote-unreachable` does not loop on a permission or wrong-URL problem. A refused connection, a DNS failure and a timeout stay `remote-unreachable`. The `try` and `soft` doors recognise a thrown `CommandFailed` by shape, so two installed copies of `@osdlc/command-seam` agree.
