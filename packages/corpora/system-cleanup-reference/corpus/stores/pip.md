---
slug: pip
category: language-package-manager
vendor: Python Packaging Authority
homepage: https://pip.pypa.io/
docs: https://pip.pypa.io/en/stable/
repository: https://github.com/pypa/pip
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: pip
checked: '2026-11-21'
sources:
- '[Caching - pip documentation v26.3](../documents/pip/Caching%20-%20pip%20documentation%20v26.3.md)'
- '[Caching (docs html topics caching.md)](../documents/pip/Caching%20%28docs%20html%20topics%20caching.md%29.md)'
- '[pip - pip documentation v26.3](../documents/pip/pip%20-%20pip%20documentation%20v26.3.md)'
- '[Configuration - pip documentation v26.3](../documents/pip/Configuration%20-%20pip%20documentation%20v26.3.md)'
---

pip is the standard package installer for Python. It keeps an on-by-default cache of HTTP responses and locally built wheels in a per-user cache directory, which grows with every distinct package version installed.

## Open

- in use: pip's docs name no lock file or process signal for its cache.
- build directories: No pip source names a regenerable directory that pip creates inside a project.
