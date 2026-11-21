---
slug: neovim
category: editor
vendor: Neovim project
homepage: https://neovim.io/
docs: https://neovim.io/doc/user/
repository: https://github.com/neovim/neovim
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: nvim
checked: '2026-11-21'
sources:
- '[Starting - Neovim docs](../documents/Neovim/Starting%20-%20Neovim%20docs.md)'
- '[Neovim lazy.nvim.txt](../documents/folke%20lazy.nvim/Neovim%20lazy.nvim.txt.md)'
- '[mason.nvim README](../documents/mason-org%20mason.nvim/mason.nvim%20README.md)'
---

Neovim is a Vim-based terminal editor that stores data in XDG base directories exposed through stdpath(). Plugin managers fill stdpath('data'): lazy.nvim clones plugins into lazy/ and mason.nvim installs language servers and tools into mason/.

## Open

- in use: No source quoted here names a lock file; whether nvim swap files or a running nvim process should block cleanup is not settled.
