---
kind: source
store: '[pyenv](../../stores/pyenv.md)'
observed: '2026-11-21'
locator: Special environment variables
reportedIn:
- '[python-build README](../../documents/pyenv/python-build%20README.md)'
excerpt:
  exact: '`PYTHON_BUILD_BUILD_PATH` sets the location in which sources are downloaded and built. By default,
    this is a subdirectory of `TMPDIR`.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

python-build README (https://raw.githubusercontent.com/pyenv/pyenv/master/plugins/python-build/README.md) says, under Special environment variables:

> `PYTHON_BUILD_BUILD_PATH` sets the location in which sources are downloaded and built. By default, this is a subdirectory of `TMPDIR`.
