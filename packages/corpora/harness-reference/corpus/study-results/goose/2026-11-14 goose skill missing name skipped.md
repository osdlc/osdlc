---
kind: source
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-agent/src/skills/discovery.rs#L69-L78 at 2365bc5e898a38133c373eef2d1357416acd66e2 (parse_skill_content)
excerpt:
  exact: let name = match metadata.name.filter(|n| !n.is_empty()) { Some(n) => n, None => { warn!( "Skill at '{}' is missing a required 'name' in frontmatter, skipping", path.display() ); return None; } };
  prefix: 'ter: {}", e); return None; } }; '
  suffix: " if name.contains('/') { warn!(\""
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let name = match metadata.name.filter(|n| !n.is_empty()) { Some(n) => n, None => { warn!( "Skill at '{}' is missing a required 'name' in frontmatter, skipping", path.display() ); return None; } };
