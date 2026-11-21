---
kind: source
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
observed: '2026-11-21'
locator: bundle pool creation
reportedIn:
- '[AgentImpl.java](../../documents/Eclipse%20Oomph/AgentImpl.java.md)'
excerpt:
  exact: bundlePool = new BundlePoolImpl(AgentImpl.this, new File(location, "pool"));
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

AgentImpl.java (https://raw.githubusercontent.com/eclipse-oomph/oomph/master/plugins/org.eclipse.oomph.p2.core/src/org/eclipse/oomph/p2/internal/core/AgentImpl.java) says, under bundle pool creation:

> bundlePool = new BundlePoolImpl(AgentImpl.this, new File(location, "pool"));
