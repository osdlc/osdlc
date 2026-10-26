---
'@osdlc/observe': minor
---

Behaviour change: the machine-id cache (`~/.cache/sdlc/machine-id`) is now keyed by a hash of the hostname, so machines that share a home directory no longer share an id. On upgrade the id is derived once more and the cache rewritten in the new form; an id set through `OBSERVE_MACHINE_ID` is unaffected. A relative `XDG_CACHE_HOME` is ignored, as the XDG spec says.
A tag inside another variable's value in `/proc/<pid>/environ` (`CMD=run OBSERVE_SESSION=x`) is no longer read as a session tag. Reconcile no longer throws on a session whose `startedAt` does not parse.
`record.json` is now written through `@osdlc/etag-write` (a new runtime dependency): the temp file is fsynced before the rename, removed when the write fails, and named uniquely per write rather than per process, and the directory is fsynced after the rename. The record's mode is now exactly `0o600` whatever the umask.
Behaviour change (stricter): the machine-id probes (`ioreg` and the like), `git config user.name` for the originator, and the `ps` scan of live sessions run their binary only from an absolute `PATH` entry, so a binary in the repository the process runs in is never run.
The machine-id cache path is now resolved by `@osdlc/tiered-dirs` (a new runtime dependency): `xdgBaseDirs` for `$XDG_CACHE_HOME` and `homeDir` for the home. Behaviour change: a relative `HOME` now falls back to the OS account's home (before, the cache was skipped); an `XDG_CACHE_HOME` with surrounding whitespace is ignored rather than trimmed; on Windows an `XDG_CACHE_HOME` with a drive letter is ignored and the cache stays under `~/.cache`.
