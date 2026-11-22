---
kind: source
store: '[pyenv](../../stores/pyenv.md)'
observed: '2026-11-21'
locator: Keeping the build directory after installation
reportedIn:
- '[python-build README](../../documents/pyenv/python-build%20README.md)'
excerpt:
  exact: Source code will be kept in a parallel directory tree `~/.pyenv/sources` when using `--keep`
    with the `pyenv install` command.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

python-build README (https://raw.githubusercontent.com/pyenv/pyenv/master/plugins/python-build/README.md) says, under Keeping the build directory after installation:

> Source code will be kept in a parallel directory tree `~/.pyenv/sources` when using `--keep` with the `pyenv install` command.
