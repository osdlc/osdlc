---
"@osdlc/file-lock": minor
---

Tell a lock's holder from a later process that reuses its pid, by start time (experimental):

- `processStartedAt(pid)` returns when a process started, in ms since the epoch. It reads `/proc` on Linux and runs `ps` in UTC and the C locale elsewhere, so the result depends on neither the time zone nor the language.
- `sameProcess(pid, startedAt)` says whether a pid still names the process a lock recorded. It accepts ms or seconds since the epoch, ISO-8601 with a zone, or `ps -o lstart` text in any time zone, and answers true when it cannot tell. Only a process that started after the recorded time counts as a different one, since a pid is reused only after its holder exits.
- `holderGone` takes `{ pid, startedAt }` entries (the `Holder` type) and counts such a holder alive only while `sameProcess` says so. A plain pid works as before. An entry that is an object with a numeric `pid` used to name no holder; it is now a holder.
