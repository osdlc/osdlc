---
'@osdlc/repo-cleaner': patch
---

The default process probe runs `ps` under `TZ=UTC` and `LC_ALL=C` and reads `lstart` as UTC, so the repeated hour of a DST fall-back and a non-English locale can no longer make a live lock owner look gone. A pid that `process.kill(pid, 0)` reports as gone is answered without spawning `ps`. A new `pidExists` option on `defaultProcessProbe` overrides that check.
