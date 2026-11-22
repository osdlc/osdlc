---
slug: cabal
category: build-tool
vendor: Cabal Development Team
homepage: https://www.haskell.org/cabal/
docs: https://cabal.readthedocs.io/en/stable/
repository: https://github.com/haskell/cabal
license: BSD-3-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: cabal
checked: '2026-11-21'
sources:
- '[4.1. Configuration — Cabal documentation](../documents/Cabal%20Development%20Team/4.1.%20Configuration%20%E2%80%94%20Cabal%20documentation.md)'
- '[2. Project Description — cabal.project File — Cabal documentation](../documents/Cabal%20Development%20Team/2.%20Project%20Description%20%E2%80%94%20cabal.project%20File%20%E2%80%94%20Cabal%20documentation.md)'
- '[4.2. Commands — Cabal documentation](../documents/Cabal%20Development%20Team/4.2.%20Commands%20%E2%80%94%20Cabal%20documentation.md)'
---

cabal-install is the Haskell build and package tool. It caches downloaded packages and the Hackage index in an XDG cache directory (or legacy ~/.cabal), keeps compiled libraries in the Cabal store under the XDG state directory, and builds each project into dist-newstyle.

## Open

- in use: No source found documents a lock file or process that marks the store as in use.
