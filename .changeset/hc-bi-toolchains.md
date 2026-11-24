---
"@osdlc/host-cleaner": minor
---

Add the `toolchains` plugin, which proposes rustup toolchains and nvm or Volta Node versions that no checkout in the targets asks for and that were not used in the last `idleHours`. It proposes nothing unless the targets were given in the config or on the command line. On a volume mounted `noatime`, where last use can't be measured, it keeps every version and says so.
