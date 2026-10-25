---
'@osdlc/detect-harness': patch
---

On Windows, `which('tool.exe')` now finds `tool.exe` on PATH. A name that already ends in a `PATHEXT` suffix is tried as given before the suffixes are added; before, only `tool.exe.EXE` and the like were tried.
