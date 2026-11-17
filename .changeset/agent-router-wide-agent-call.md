---
"@osdlc/agent-router": patch
---

`@osdlc/agent-call` is a dependency at `>=0.12.0 <1` (was `^0.14.0`, a caret that locked one 0.x
minor). agent-router imports only `EFFORT_LEVELS` from `@osdlc/agent-call/models`, which is the
same in every release from 0.12, so a host on any of them now installs one copy of agent-call
instead of a second one under agent-router.
