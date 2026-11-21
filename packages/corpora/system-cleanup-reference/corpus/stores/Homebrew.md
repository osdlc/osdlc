---
slug: homebrew
category: os-package-manager
vendor: Homebrew
homepage: https://brew.sh
docs: https://docs.brew.sh
repository: https://github.com/Homebrew/brew
license: BSD-2-Clause
open_source: true
platforms:
- macos
- linux
cli: brew
system: true
checked: '2026-11-21'
sources:
- '[brew(1) – The Missing Package Manager for macOS (or Linux)](../documents/Homebrew/brew%281%29%20%E2%80%93%20The%20Missing%20Package%20Manager%20for%20macOS%20%28or%20Linux%29.md)'
- '[Homebrew Documentation Installation](../documents/Homebrew/Homebrew%20Documentation%20Installation.md)'
- '[Homebrew Documentation FAQ](../documents/Homebrew/Homebrew%20Documentation%20FAQ.md)'
---

Homebrew is a package manager for macOS and Linux that installs formulae and casks under its own prefix and runs as the user, not root. It fills disks with a download cache of bottles and cask installers and with old versions of upgraded formulae kept in the Cellar until brew cleanup removes them.

## Open

- in use: Where Homebrew keeps its lock files and how a cleaner can tell brew is running are not documented in the sources read.
