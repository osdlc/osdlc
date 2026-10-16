# sdlc

A control plane for a software factory: the `sdlc` CLI, entity model, and
agent-harness plugin that captures the artifacts of building software —
roadmaps, milestones, tasks — as plain markdown files with schema-validated
frontmatter, and runs the workflows that move that work through its
lifecycle.

This repository is sdlc's published home: a two-plugin marketplace,
self-contained at the repo root, for Claude Code, Codex, Cursor and Pi. It
carries two plugins:

- `sdlc`: the CLI, entity model and workflows described above.
- `craft`: script-free, portable skills for the software development lifecycle. Each is a terse
  description of one process. A project fills a skill's extension points in
  `<project>/sdlc/extend/skills/<skill>.lifecycle`. `craft` works without `sdlc`; install either
  plugin alone or both.

sdlc is developed in [sksizer/dev](https://github.com/sksizer/dev)
(`solutions/ontological`) and released here — see
[CHANGELOG.md](./CHANGELOG.md) for what shipped in each version. This
repo's own git history predates sdlc (it was a standalone Python project);
that history is kept, never rewritten, when a release replaces the tree.

## Current version

**v0.13.0**

## Install

### Claude Code

```text
/plugin marketplace add sksizer/sdlc
/plugin install sdlc@sdlc
/plugin install craft@sdlc
```

### Codex

Codex reads a marketplace manifest at `.agents/plugins/marketplace.json` in
a repository root. Point your Codex configuration at this repository (by
local path once cloned, or by whatever remote-repository mechanism your
Codex CLI version supports) to pick up both plugins.

### Cursor

Cursor reads a marketplace manifest at `.cursor-plugin/marketplace.json` in
a repository root, the same way. Point Cursor at this repository to pick up
both plugins.

### Pi

Pi has no marketplace. Clone this repository and install each pack by path:

```text
pi install <clone>/.pi/packs/sdlc
pi install <clone>/.pi/packs/craft
```

Pi names each skill `<plugin>-<skill>` and runs it as
`/skill:<plugin>-<skill>` (for example `/skill:sdlc-task-work`).
Calls from one skill to another render in that form once the skill
sources use the `/[[skill]]` call syntax. Until then they read
`/sdlc:<skill>`, which Pi cannot run.

## License

Apache-2.0 with an AI-training restriction (see [LICENSE](./LICENSE)).
Because of the added condition this is source-available, not OSI-approved
open source. See also [NOTICE](./NOTICE).
