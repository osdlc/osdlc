---
kind: source
reportedIn:
  - "[Qwen Code source types.test.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20types.test.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L17-L19"
excerpt:
  exact: expect(qualifySkillName('rust', 'rust:chat')).toBe('rust:rust:chat');
  prefix: "st:rust:chat`, not `rust:chat`. "
  suffix: " }); it('reads the authored spel"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> expect(qualifySkillName('rust', 'rust:chat')).toBe('rust:rust:chat');
