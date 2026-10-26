---
'@osdlc/detect-harness': minor
---

On Windows, `which('tool.exe')` now finds `tool.exe` on PATH. A name that already ends in a `PATHEXT` suffix is tried as given only; before, only `tool.exe.EXE` and the like were tried.
Behaviour change (stricter): `which` and the default install probe search only absolute `PATH` entries. A relative entry is skipped instead of being resolved against the project root, so a binary the project ships is never reported as the install or run for `--version`; `which`'s `cwd` argument no longer affects a lookup. The default `makeRunner` now runs a bare name only from an absolute `PATH` entry. `which` now uses `@osdlc/command-seam`'s lookup, so on Windows a quoted `PATH` entry counts without its quotes, `Path` is read in any case, an empty `PATHEXT` means the default list, a drive-relative entry (`\bin`) is skipped, and a match needs only to be a file.
Behaviour change (Windows only): `which` given an absolute path without a `PATHEXT` extension (`C:\tools\claude`) now tries that path with each `PATHEXT` suffix (`claude.COM`, `claude.EXE`, ...) and no longer tries the exact name; a path that already ends in a `PATHEXT` extension is tried as given. `PATHEXT` is read from the passed `env` (in any case), never from `process.env`.
