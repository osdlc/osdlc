---
kind: source
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
version: 1.0.45
version_basis: exact
observed: 2026-11-14
locator: crates/codegen/xai-grok-tools/src/implementations/skills/discovery.rs:550-558 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
excerpt:
  exact: 'license: coerce_to_string(frontmatter.get("license")), compatibility: coerce_to_string(frontmatter.get("compatibility")), short_description, author, metadata, argument_hint: coerce_to_string(frontmatter.get("argument-hint")), allowed_tools: coerce_tool_list(frontmatter.get("allowed-tools")), model: coerce_to_string(frontmatter.get("model")), effort: coerce_to_string(frontmatter.get("effort")),'
  prefix: "rontmatter { name, description, "
  suffix: " // Absent `user-invocable` defa"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> license: coerce_to_string(frontmatter.get("license")), compatibility: coerce_to_string(frontmatter.get("compatibility")), short_description, author, metadata, argument_hint: coerce_to_string(frontmatter.get("argument-hint")), allowed_tools: coerce_tool_list(frontmatter.get("allowed-tools")), model: coerce_to_string(frontmatter.get("model")), effort: coerce_to_string(frontmatter.get("effort")),
