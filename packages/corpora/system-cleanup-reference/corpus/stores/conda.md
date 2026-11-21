---
slug: conda
category: language-package-manager
vendor: conda community (originally Anaconda, Inc.)
homepage: https://conda.org/
docs: https://docs.conda.io/projects/conda/en/latest/
repository: https://github.com/conda/conda
license: BSD-3-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: conda
checked: '2026-11-21'
sources:
- '[Using Custom Locations for Environment and Package Cache — conda documentation](../documents/conda/Using%20Custom%20Locations%20for%20Environment%20and%20Package%20Cache%20%E2%80%94%20conda%20documentation.md)'
- '[Settings — conda documentation](../documents/conda/Settings%20%E2%80%94%20conda%20documentation.md)'
- '[conda base context.py](../documents/conda/conda%20base%20context.py.md)'
- '[Linux installer for Miniconda](../documents/Anaconda/Linux%20installer%20for%20Miniconda.md)'
- '[Miniforge README](../documents/conda-forge/Miniforge%20README.md)'
- '[conda clean — conda documentation](../documents/conda/conda%20clean%20%E2%80%94%20conda%20documentation.md)'
- '[Managing environments — conda documentation](../documents/conda/Managing%20environments%20%E2%80%94%20conda%20documentation.md)'
- '[conda info — conda documentation](../documents/conda/conda%20info%20%E2%80%94%20conda%20documentation.md)'
- '[Creating projects — conda documentation](../documents/conda/Creating%20projects%20%E2%80%94%20conda%20documentation.md)'
---

conda is a cross-language package and environment manager, installed through Miniconda, Anaconda or Miniforge (which also ships mamba). Its pkgs package cache and its envs environments are usually the largest folders of an installation; both sit under the base install directory, such as ~/miniconda3 or ~/miniforge3.

## Open

- in use: No conda source here names a lock file or process to check before cleaning pkgs or envs.
