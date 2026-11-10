---
kind: source
reportedIn:
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-04
locator: crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:29 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/duplicate-names@grok-build#observation-1
---

Imported from `facts/grok-build/skills/duplicate-names.md`, observation 1.

- behavior: "higher-priority location overrides lower"
- order: [".grok/skills (cwd)","<repo_root>/.grok/skills","~/.grok/skills and ~/.claude/skills","project .claude and .cursor skills rank high"]
- plugin_skill: "does not override a native skill; stays available as plugin:name"
- builtin_collision: "both stay invocable, skill advertised under a scope-qualified name such as /user:commit"

The table lists ./.claude/skills as High but above ~/.grok/skills; exact tie order between .grok, .agents and .claude at one tier is not stated.
