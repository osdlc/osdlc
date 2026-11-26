---
"@osdlc/host-cleaner": minor
---

Find the shipped stores where their documented variables, config files and commands moved them, and ship a descriptor for Go's module and build caches. A variable's `command` source takes `env` entries, a variable set in the config also wins over the sources of the variables built from it, and an `env` source that reads an `XDG_*` folder the environment sets keeps the trust that folder has.
