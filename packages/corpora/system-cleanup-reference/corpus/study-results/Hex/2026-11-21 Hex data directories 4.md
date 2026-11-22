---
kind: source
store: '[Hex](../../stores/Hex.md)'
observed: '2026-11-21'
locator: find_config_home
reportedIn:
- '[lib hex config.ex](../../documents/Hex/lib%20hex%20config.ex.md)'
excerpt:
  exact: '{{:env, "MIX_XDG"}, :filename.basedir(setting, "hex", %{os: :linux})}'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

lib hex config.ex (https://raw.githubusercontent.com/hexpm/hex/main/lib/hex/config.ex) says, under find_config_home:

> {{:env, "MIX_XDG"}, :filename.basedir(setting, "hex", %{os: :linux})}
