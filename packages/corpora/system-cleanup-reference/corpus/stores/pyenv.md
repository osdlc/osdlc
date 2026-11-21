---
slug: pyenv
category: toolchain-manager
vendor: pyenv project
homepage: https://github.com/pyenv/pyenv
docs: https://github.com/pyenv/pyenv#readme
repository: https://github.com/pyenv/pyenv
license: MIT
open_source: true
platforms:
- macos
- linux
cli: pyenv
checked: '2026-11-21'
sources:
- '[pyenv pyenv README](../documents/pyenv/pyenv%20pyenv%20README.md)'
- '[python-build README](../documents/pyenv/python-build%20README.md)'
- '[pyenv COMMANDS.md](../documents/pyenv/pyenv%20COMMANDS.md.md)'
---

pyenv installs and switches between many Python versions, building each from source with its python-build plugin. Every installed version is a full Python tree under ~/.pyenv/versions, and these accumulate over time; optional download caches and kept sources add more.

## Open

- in use: No pyenv source names a way to tell that an installed version is in use.
- build directories: No pyenv source names a regenerable directory inside a project.
