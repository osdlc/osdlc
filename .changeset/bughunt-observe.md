---
'@osdlc/observe': minor
---

Behaviour change: the machine-id cache (`~/.cache/sdlc/machine-id`) is now keyed by a hash of the hostname, so machines that share a home directory no longer share an id. On upgrade the id is derived once more and the cache rewritten in the new form; an id set through `OBSERVE_MACHINE_ID` is unaffected. A relative `XDG_CACHE_HOME` is ignored, as the XDG spec says.
A tag inside another variable's value in `/proc/<pid>/environ` (`CMD=run OBSERVE_SESSION=x`) is no longer read as a session tag. Reconcile no longer throws on a session whose `startedAt` does not parse.
