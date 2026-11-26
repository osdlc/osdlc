---
"@osdlc/host-cleaner": minor
---

Add the `toolchains` plugin, which proposes rustup toolchains and nvm or Volta Node versions that no checkout in the targets asks for and that were not used in the last `idleHours`. It proposes nothing unless the targets were given in the config or on the command line. On a volume mounted `noatime`, and on macOS unless the volume is mounted `strictatime`, where last use can't be measured, it keeps every version and says so. A Node version holding global npm packages is held for review, since they go with it.
