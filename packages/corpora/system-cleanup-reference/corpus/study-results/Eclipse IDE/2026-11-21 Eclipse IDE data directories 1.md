---
kind: source
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
observed: '2026-11-21'
locator: AgentManagerImpl constructor
reportedIn:
- '[AgentManagerImpl.java](../../documents/Eclipse%20Oomph/AgentManagerImpl.java.md)'
excerpt:
  exact: defaultAgentLocation = new File(userHome, ".p2");
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

AgentManagerImpl.java (https://raw.githubusercontent.com/eclipse-oomph/oomph/master/plugins/org.eclipse.oomph.p2.core/src/org/eclipse/oomph/p2/internal/core/AgentManagerImpl.java) says, under AgentManagerImpl constructor:

> defaultAgentLocation = new File(userHome, ".p2");
