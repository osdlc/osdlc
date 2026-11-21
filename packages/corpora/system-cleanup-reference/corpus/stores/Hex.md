---
slug: hex
category: language-package-manager
vendor: Hex
homepage: https://hex.pm
docs: https://hexdocs.pm/hex/
repository: https://github.com/hexpm/hex
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: mix hex
checked: '2026-11-21'
sources:
- '[mix hex.config — Hex v2.7.0](../documents/Hex/mix%20hex.config%20%E2%80%94%20Hex%20v2.7.0.md)'
- '[lib hex scm.ex](../documents/Hex/lib%20hex%20scm.ex.md)'
- '[lib hex config.ex](../documents/Hex/lib%20hex%20config.ex.md)'
- '[API Reference — Hex v2.7.0](../documents/Hex/API%20Reference%20%E2%80%94%20Hex%20v2.7.0.md)'
---

Hex is the package manager for the Erlang ecosystem, used by Mix to fetch dependencies. It keeps a per-user cache of downloaded package tarballs and registry data under ~/.hex (or XDG directories when MIX_XDG is set) and unpacks packages into each project's deps directory.

## Open

- in use: No source found documents a lock file or process that marks the Hex cache as in use.
- build directories: Hex creates no project directories of its own in the sources read; deps and _build belong to Mix.
