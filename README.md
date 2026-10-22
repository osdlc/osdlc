<!--
Written by the sdlc product release from sksizer/dev
(scripts/sdlc-mirror/templates/product/README.md). An edit made here is replaced by the next
release; edit it in sksizer/dev.
-->

# osdlc (Open SDLC)

This repository is the home of the `sdlc` CLI and its two plugins, `sdlc` and `craft`. It also
holds the `@osdlc` libraries under `packages/`.

The CLI and the plugins are still named `sdlc`. They will be renamed `osdlc` later.

- `sdlc` (CLI and plugin): captures the work of building software, such as roadmaps, milestones
  and tasks, as markdown files with schema-checked frontmatter. It runs the workflows that move
  that work through its lifecycle.
- `craft` (plugin): portable skills for the software development lifecycle, with no scripts. Each
  skill describes one process. A project fills a skill's extension points in
  `<project>/sdlc/extend/skills/<skill>.lifecycle`. `craft` works without `sdlc`, so you can
  install either plugin or both.

The repository is a plugin marketplace for Claude Code, Codex, Cursor and Pi. It is developed in a
separate development repository and released here. See [CHANGELOG.md](./CHANGELOG.md) for what
each version shipped.

## Current version

**v0.15.0**

## Install

### Claude Code

```text
/plugin marketplace add osdlc/osdlc
/plugin install sdlc@osdlc
/plugin install craft@osdlc
```

### Codex

Codex reads a marketplace manifest at `.agents/plugins/marketplace.json` in a repository root.
Point your Codex configuration at this repository to pick up both plugins. Use a local path once
cloned, or the remote-repository option your Codex CLI version supports.

### Cursor

Cursor reads a marketplace manifest at `.cursor-plugin/marketplace.json` in a repository root.
Point Cursor at this repository to pick up both plugins.

### Pi

Pi has no marketplace. Clone this repository and install each pack by path:

```text
pi install <clone>/.pi/packs/sdlc
pi install <clone>/.pi/packs/craft
```

Pi names each skill `<plugin>-<skill>` and runs it as `/skill:<plugin>-<skill>`, for example
`/skill:sdlc-task-work`. A skill that calls another skill names it in that form once the skill
sources use the `/[[skill]]` call syntax. Until then the call reads `/sdlc:<skill>`, which Pi
cannot run.

## Libraries

`packages/` holds the libraries developed in this repository and published to npm from it. See
[packages/README.md](./packages/README.md) for the list and for how they are developed and
released.

## License

Apache-2.0 with an AI-training restriction (see [LICENSE](./LICENSE)). Because of the added
condition this is source-available, not OSI-approved open source. See also [NOTICE](./NOTICE).
