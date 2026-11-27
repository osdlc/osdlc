---
"@osdlc/pr-update": patch
---

A `--repo` on one port of a host is no longer served by a clone or checkout
of another port of it. A managed clone records the host it was made for, port
included, and serves only that one; a clone of `ghe.local:3000` leaves
`--repo ghe.local:4000/o/n` unserved, with a note. A checkout found on this
machine is used only when its `origin` is an `http(s)` URL on the port
`--repo` names (none, or the scheme's own, when it names none); with a port
named, an ssh `origin` is not used, since its port cannot say. A bare
`owner/name` on the project root's GitHub host now takes the port of the
root's `origin` too.
