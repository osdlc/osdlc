# @osdlc/detect-harness

Find the coding-agent harnesses on a machine and in a project, and read what
each one has configured. It knows six harnesses: Claude Code, Codex, Cursor,
opencode, pi and Antigravity.

The package only reads. It never writes a harness's files, and it runs a
program only when you pass `allowExec: true`. Secret values in MCP settings
are redacted by default; see [Secrets](#secrets) for the exact rule.

## What it is for

Tools that work with coding agents often need to know which agents are on a
machine, and what each one is configured with: plugins, skills, hooks, MCP
servers, permissions, instruction files and whether the user is signed in. Each
agent keeps this in its own files, formats and scopes. This package reads them
and returns one report shape for all six harnesses.

It is for authors of developer tools, editor extensions, CI checks and agent
wrappers that need that picture, and for anyone who wants to audit what an
agent may do in a project.

Do not use it to:

- write or install harness files, or move configuration from one harness to
  another;
- run an agent;
- only ask "is this process inside an agent?" when you need nothing else. Use
  `current()` here, or one of the smaller packages below;
- run in a browser. It reads files, so it needs Node.

## Install

```sh
npm install @osdlc/detect-harness zod
```

`pnpm add @osdlc/detect-harness` and `yarn add @osdlc/detect-harness` work too.

`zod` `^4` is a peer dependency, because the report schemas are public. Node 22
or newer.

## Use

```ts
import { detect } from '@osdlc/detect-harness'

const catalog = await detect({ projectRoot: '/path/to/project' })
for (const report of catalog.reports) {
  report.harness // "claude", "codex", ...
  report.status // "ok" when anything was found, else "absent" (or "error")
  report.install // { found, path, how, version }
  report.mcpServers // env and header values read "<redacted>"
}
```

`detect(options?)` returns a `HarnessCatalog` with one `HarnessReport` per
harness, in a fixed order. Options:

| Option          | Default            | Meaning                                                                   |
| --------------- | ------------------ | ------------------------------------------------------------------------- |
| `projectRoot`   | `process.cwd()`    | The project to read.                                                      |
| `home`          | absolute `HOME`    | The home folder to read. A relative `HOME` counts as unset.               |
| `env`           | `process.env`      | The environment: overrides such as `CLAUDE_CONFIG_DIR`, `PATH`, API keys. |
| `mode`          | `full`             | `project` reads project files only; see below.                            |
| `allowExec`     | `false`            | Run `<binary> --version` to fill `install.version`.                       |
| `includeValues` | `false`            | Keep MCP `env` and header values, URL credentials and secret-looking `args`. |
| `readContents`  | `false`            | Return the markdown body of each skill, command and agent.                |
| `only`          | all                | Harness ids to read.                                                      |
| `exclude`       | none               | Harness ids to skip.                                                      |
| `providers`     | built-ins          | Replace or add providers.                                                 |
| `binaries`      | the table's        | Binary name per harness id, for a setup that renames one.                 |
| `which`         | walks `env.PATH`   | `PATH` lookup, absolute entries only. Tests inject this.                  |
| `makeRunner`    | command seam       | Builds the runner for `--version`. Tests inject this.                     |
| `platform`      | `process.platform` | Chooses the managed-settings folder.                                      |
| `signal`        | none               | An `AbortSignal` that stops the `--version` run; providers see it too.    |
| `systemRoot`    | `/` (win32: drive) | Root for system paths (`/etc/claude-code`, `/Applications`).              |

### Project mode

`detect({ mode: 'project' })` is for project introspection. It reads files
inside the project root only: no home folder, no system folder, no install
probe and no sign-in evidence. A read outside the root, including through a
symbolic link, answers "absent" without reading it. Only the `project`
and `local` scopes are reported, and `install.probed` is `false`.

Project mode lists the skills a repository ships: `.claude/skills`,
`.agents/skills` and `.cursor/skills` in the project. Each entry has `name`,
`description`, `argumentHint`, `origin`, `scope` and `path`. A tool can show
them as tasks without reading any file outside the project:

```ts
const catalog = await detect({ projectRoot, mode: 'project' })
const skills = catalog.reports.flatMap((r) => r.skills)
// [{ name: 'review', description: 'Review a PR.', argumentHint: '[pr-number]', origin: 'project', ... }]
```

## The report

Every field is always present. A harness that has no such thing, or one this
release does not read yet, reports it empty.

| Field          | What it holds                                                                          |
| -------------- | -------------------------------------------------------------------------------------- |
| `install`      | The binary on `PATH` or a macOS app bundle; the version only with `allowExec`.         |
| `configDirs`   | The harness's folders, the variable that moved each, and whether it exists.            |
| `sources`      | Every config file looked at: path, scope, kind, `parsed`/`absent`/`error`, rank.       |
| `plugins`      | Installed and enabled plugins, with scope, version, install path and enabling file.    |
| `marketplaces` | Known marketplaces and their source.                                                   |
| `skills`       | Skill folders (`<name>/SKILL.md`): name, description, argument hint, path, scope, origin. |
| `commands`     | Commands, the same shape.                                                              |
| `agents`       | Agent definitions, the same shape.                                                     |
| `hooks`        | Hook handlers: event as the harness spells it, matcher, command, source, trust.        |
| `mcpServers`   | MCP servers with scope and source; `active` says whether the harness would start one.  |
| `permissions`  | Allow, deny and ask rules with their scope, and the winning `defaultMode`.             |
| `instructions` | Instruction files: `CLAUDE.md`, `AGENTS.md`, rules folders.                            |
| `auth`         | Offline sign-in evidence; see below.                                                   |
| `diagnostics`  | Unreadable files and other things worth a look.                                        |

Each skill, command and agent has an `argumentHint`: the `argument-hint`
front matter field, such as `[pr-number]`, or `null`. Claude Code reads the
field as text, so an unquoted value is reported as written:
`argument-hint: [pr-number] [priority]` gives `[pr-number] [priority]`,
though it is not valid YAML. A value that is not text, such as a block
list, gives `null`. When front matter is still not valid YAML (for example
`description: Use when: ...`), `name`, `description` and `argument-hint`
are read from their raw lines and the other keys are dropped. The `./model`
entry point reads the front matter the same way.

Names, descriptions, hints and other strings in the report come from files
in the repository and the user's config. They can hold terminal control
characters. Strip them before printing to a terminal, for example with
`stripControls` from `@osdlc/ux`.

Each skill, command, agent, hook and server has an `origin`: `user`,
`project`, `local`, `managed`, or `plugin:<id>` for one a plugin brought.
`managerOwned` is true for the plugin ones.

The schemas are exported (`HarnessCatalogSchema`, `HarnessReportSchema`, and
one per shape).

## What each harness reads

- **claude**: settings at four scopes (user, project, local, managed);
  `~/.claude.json` for user and local MCP servers and the project's MCP
  approval lists only; `.mcp.json`;
  `managed-mcp.json`; the plugin and marketplace registries; each enabled
  plugin's skills, commands, agents, hooks and MCP servers; user and project
  skills, commands and agents; `CLAUDE.md` files and rules folders.
- **codex**: user and project `config.toml` (MCP servers); user and project
  `hooks.json`, with the trust Codex recorded in `[hooks.state]`;
  `~/.codex/skills`, `~/.agents/skills` and `.agents/skills`; `AGENTS.md`.
- **cursor**: user and project `mcp.json` and `hooks.json`; `~/.cursor/skills`
  and `.cursor/skills`; `AGENTS.md`, `.cursorrules` and `.cursor/rules`.
- **opencode**, **pi**, **antigravity**: install, folders and sign-in evidence.

Claude Code precedence: managed beats local, local beats project, project beats
user. A single value (`defaultMode`, one `enabledPlugins` entry) takes the
highest scope's; permission rules and hooks from every scope add up. A plugin
registry record is reported when it applies to this project: a user or managed
install, or a project or local install for this project root. In a linked git worktree
the main checkout counts too: the `.git` file and its `commondir` name it, and
no git command runs. When several apply, the highest scope's is kept.

A Claude Code MCP server is `active` when all of these hold:

1. If it comes from `.mcp.json`, it is approved: no `disabledMcpjsonServers`
   list names it, and an `enabledMcpjsonServers` list names it or
   `enableAllProjectMcpServers` is true. The lists come from every settings
   scope and from this project's entry in `~/.claude.json`. A server with no
   answer yet is inactive.
2. If `managed-mcp.json` exists and parses, it comes from that file. Plugin
   servers are inactive too.
3. No active server of the same name comes from a higher scope. Plugin servers
   are namespaced by their plugin, so this rule does not apply to them.

The settings follow Claude Code's documentation. Three details are not
confirmed against its code: that a rejection beats an approval, that a server
not approved does not hide a same-named one from a lower scope, and that
`managed-mcp.json` turns off plugin servers too. For Codex and Cursor, a
project server replaces a same-named user one, and Codex's `enabled = false`
makes a server inactive.

## Secrets

- MCP `env` and header values, and the user part and query values of a URL,
  read `"<redacted>"`. Marketplace URLs are redacted the same way.
- MCP `args` are redacted when they look like secrets:
  - the value of a `--flag` whose name contains `token`, `secret`, `key`,
    `password` or `auth` (any case), both as the next arg and in the
    `--flag=value` form; a next arg that starts with `--` is another flag
    and is kept;
  - a `KEY=value` arg whose `KEY` contains `token`, `secret`, `key` or
    `password` (any case);
  - the value of an `Authorization:` header arg, and the token of a
    `Bearer <token>` arg;
  - the user part and query values of any arg that contains `://`.

  Other args are returned as written.
- Pass `includeValues: true` to keep every value above as written.
- Credential files are tested for existence, never read for values.
- From `~/.claude.json`, only the `mcpServers` maps and this project's
  `enabledMcpjsonServers` and `disabledMcpjsonServers` are read, plus whether
  an `oauthAccount` key exists.
- pi's auth file is read for its top-level key names, which are its provider
  names.
- Hook commands, and MCP args that match none of the rules above, are
  returned as written. Do not put secrets in them.

## Sign-in evidence

`auth.signedIn` is `true`, with `auth.evidence` naming the evidence (a path,
`path#key` or a variable name), or `'unknown'`. A missing file proves nothing,
because a login can live in a keychain.

- **claude**: `<config>/.credentials.json`; the `oauthAccount` key of
  `~/.claude.json`; `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`.
- **codex**: `<CODEX_HOME>/auth.json`; `OPENAI_API_KEY` or `CODEX_API_KEY`.
- **cursor**: `CURSOR_API_KEY`.
- **opencode**: `<data>/auth.json`.
- **pi**: `<agent dir>/auth.json` with at least one provider key.
- **antigravity**: none; its login lives in the OS keyring.

## Locations

`LOCATIONS` (also at `@osdlc/detect-harness/locations`) is the table of where
each harness keeps its files: base folders with their environment overrides
(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`PI_CODING_AGENT_DIR`), and the files and folders built on them, each with a
role and a scope. Session and transcript folders are listed as paths only. The
providers resolve their paths from this table, so it is what `detect()` reads.

```ts
import { resolveConfigDir } from '@osdlc/detect-harness/locations'

resolveConfigDir('codex', { home: '/home/me', env: process.env }) // "/home/me/.codex"
```

`resolveBase`, `resolveBases`, `resolveLocations` and `resolveTemplate` resolve
the rest. The table is `@experimental`: it grows as harnesses change.

## Which harness am I in?

```ts
import { current } from '@osdlc/detect-harness'

current(process.env) // { harness: 'claude', evidence: 'CLAUDECODE' } or null
```

It checks, in order:

1. each harness's `currentEnv` variables in `LOCATIONS` (`CLAUDECODE`,
   `CURSOR_AGENT`, `OPENCODE`, and so on);
2. the cross-vendor `AI_AGENT`, mapped through `harnessId`;
3. each harness's `weakEnv` variables: `CURSOR_TRACE_ID`, which Cursor also
   sets in its editor terminal, where no agent may be running.

## Ids

The ids are: `claude`, `codex`, `cursor`,
`opencode`, `pi`, `antigravity` (`BUILTIN_HARNESSES`). `HARNESS_ALIASES` maps
other spellings (`claude-code`, `codex-cli`, `open-code`, `cursor-agent`, `agy`)
to them, and `harnessId(name)` takes either.

## Adding a harness

A provider is an object with an `id`, a `label`, a `kind`, an optional `binary`
and a `collect(ctx)` function. `detect()` probes the binary itself, so a
provider never reports its own install. Every read goes through `ctx`, which
enforces project mode and is what tests replace.

```ts
import { builtinProviders, detect, type HarnessProvider } from '@osdlc/detect-harness'

const mine: HarnessProvider = {
  id: 'mytool',
  label: 'My Tool',
  kind: 'parse',
  binary: 'mytool',
  collect: (ctx) => ({ instructions: [] }),
}
await detect({ providers: [...builtinProviders, mine] })
```

A provider of `kind: 'exec'` is skipped unless `allowExec` is set.

## Reading one plugin folder (experimental)

`@osdlc/detect-harness/model` reads one Claude Code plugin folder into a typed
`HarnessModel`: metadata, skills and commands with their files, hooks, MCP
servers, permissions and shared documents.

```ts
import { readPlugin } from '@osdlc/detect-harness/model'

const model = readPlugin('/path/to/plugin')
```

| Option          | Default       | Meaning                                                     |
| --------------- | ------------- | ----------------------------------------------------------- |
| `documentsDir`  | `conventions` | Folder under the root whose `.md` files become `documents`. |
| `includeValues` | `false`       | Keep MCP values as written; see [Secrets](#secrets).        |

It reads `.claude-plugin/plugin.json` (or `plugin.json`),
`skills/<name>/SKILL.md`, `commands/<name>.md` and `commands/<name>/SKILL.md`,
`<documentsDir>/**/*.md`, `hooks/hooks.json`, the `hooks` and `mcpServers` of
`plugin.json` (inline, a path inside the plugin, or a list), `.mcp.json` and
`.claude/settings{,.local}.json`. `readClaudeControlPlane` and
`readPluginControlPlane` read the settings and plugin sources alone.

The entry is experimental: a harness-neutral surface with provenance is
planned, and its shape will change.

## How it compares

These packages are on npm. Each does a different job from this one.

| Package                                                                    | What it does                                                                                           | What it does that this does not                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`@vercel/detect-agent`](https://www.npmjs.com/package/@vercel/detect-agent) | Says whether code runs inside an AI agent, from environment variables, and names it.                 | Recognises more agents and hosts by environment. It does not read configuration. |
| [`agent-cli-detector`](https://www.npmjs.com/package/agent-cli-detector)     | Says whether a CLI runs inside a coding agent, and gives a session id for some agents.               | Recognises more agents, and reads session ids. It does not read configuration.   |
| [`agent-plugins`](https://www.npmjs.com/package/agent-plugins)               | Manages and syncs skills, commands, rules and MCP configs across several agents.                     | Writes and syncs agent files. This package never writes.                          |
| [`agent-install`](https://www.npmjs.com/package/agent-install)               | Installs `SKILL.md` files, MCP servers and `AGENTS.md` guidance for coding agents, as an API and CLI. | Installs. This package only reads.                                                |

This package's `current()` answers the same question as the first two for the
six harnesses it knows. Its other work, reading what each harness has
configured, is what those packages leave out.

The author's own related libraries:

- [`@osdlc/agent-call`](https://www.npmjs.com/package/@osdlc/agent-call): one
  call spec for headless coding-agent CLIs. Its `detectAgents` checks that each
  agent's command runs, by calling it with `--version`. It reads no
  configuration. It also builds and runs agent calls, which this package never
  does.
- `@osdlc/detect-runners`: detects runners. It is not released yet; the name on
  npm is only a placeholder.
- [`agent-adapt`](https://crates.io/crates/agent-adapt), a Rust crate: authors
  skills, agents, hooks and MCP servers once and writes them out for several
  runtimes. It writes; this package only reads.

## Platforms

- Linux and macOS are supported. CI tests them on Node 22 and 24.
- `PATH` lookup searches absolute entries only. A relative or empty entry is
  skipped, so a binary the project ships is never reported or run.
- Windows is handled in the code but is not tested. `PATH` lookup tries the
  `PATHEXT` suffixes, and the system root is the system drive. On Windows the
  execute bit does not exist, so an install is found by the file's name and
  `PATHEXT`, not by a permission check. Paths use `\` there, as `node:path`
  gives them. Do not rely on Windows until a CI job covers it.
- Node 22 or newer. ESM only. No browser build.

## Experimental

These exports can change in a minor release. The same names carry the
`@experimental` tag in the source, and a test checks that this list and the
tags agree.

The location table and its resolvers (also on `@osdlc/detect-harness/locations`):

- `LOCATIONS`
- `SCOPES`
- `Scope`
- `LocationRole`
- `EnvOverride`
- `PlatformTemplate`
- `BaseDir`
- `LocationPath`
- `HarnessLocations`
- `LocationContext`
- `ResolvedDir`
- `ResolvedLocation`
- `defaultSystemRoot`
- `resolveBase`
- `resolveBases`
- `resolveConfigDir`
- `resolveLocations`
- `resolveTemplate`

The plugin reader, on `@osdlc/detect-harness/model` only:

- `readPlugin`
- `ReadPluginOptions`
- `readClaudeControlPlane`
- `readPluginControlPlane`
- `ClaudeControlPlane`
- `ControlPlaneOptions`
- `countResources`
- `capabilitiesOfKind`
- `HARNESS_MODEL_VERSION`
- `HarnessMetadataSchema`
- `HarnessMetadata`
- `HarnessResourceSchema`
- `HarnessResource`
- `CapabilityKindSchema`
- `CapabilityKind`
- `HarnessCapabilitySchema`
- `HarnessCapability`
- `HarnessHookSchema`
- `HarnessHook`
- `McpTransportSchema`
- `McpTransport`
- `HarnessMcpServerSchema`
- `HarnessMcpServer`
- `HarnessPermissionsSchema`
- `HarnessPermissions`
- `HarnessDocumentSchema`
- `HarnessDocument`
- `HarnessModelSchema`
- `HarnessModel`

## Limits

- Claude Code instruction files are looked for in the project root only, not
  in parent folders.
- Codex and Cursor plugins and marketplaces, and the config of opencode, pi and
  Antigravity, are not read yet.
- `install.version` is the first version-shaped text `--version` prints.
- Hook commands are data. Nothing is run.

## Where the facts come from

The location table was written from each harness's public documentation. The
variables `current()` checks were read from the shipped code of Codex 0.159,
Cursor Agent 2026.08, opencode 1.18 and pi 0.99. A wrong entry is a bug in the table.

## Stability

The root entry is stable. The exports in [Experimental](#experimental) may change
in a minor release. See the [decision notes](docs/planning/decisions/) for why the package
has this shape.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
