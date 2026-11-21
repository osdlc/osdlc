---
kind: docs
store: '[conda](../../stores/conda.md)'
observed: '2026-11-21'
locator: 'pkgs_dirs: Specify package directories'
version: 26.11.0.dev60
version_basis: exact
reportedIn:
- '[Settings — conda documentation](../../documents/conda/Settings%20%E2%80%94%20conda%20documentation.md)'
excerpt:
  exact: If the pkgs_dirs key is not set, then envs/pkgs is used as the pkgs cache, except for the standard
    envs directory in the root directory, for which the normal root_dir/pkgs is used.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Settings — conda documentation (https://docs.conda.io/projects/conda/en/latest/user-guide/configuration/settings.html) says, under pkgs_dirs: Specify package directories:

> If the pkgs_dirs key is not set, then envs/pkgs is used as the pkgs cache, except for the standard envs directory in the root directory, for which the normal root_dir/pkgs is used.
