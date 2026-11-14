---
kind: source
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-agent/src/skills/discovery.rs#L80-L83 at 2365bc5e898a38133c373eef2d1357416acd66e2 (parse_skill_content)
excerpt:
  exact: if name.contains('/') { warn!("Skill name '{}' contains '/', skipping", name); return None; }
  prefix: ".display() ); return None; } }; "
  suffix: " Some(SourceEntry { source_type:"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if name.contains('/') { warn!("Skill name '{}' contains '/', skipping", name); return None; }
