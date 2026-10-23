---
"@osdlc/command-seam": patch
---

The async runners keep the other stream's output when one stream passes `maxOutputBytes`. The run used to settle as soon as the cap was passed and close both pipes, so output the child had already written to the other stream could be lost. It now kills the child and settles once the pipes close (or after the exit grace), with the same `reason: 'output'` result as before.
