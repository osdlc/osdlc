/**
 * The `guide` subcommand: Markdown for a person or a model who has the binary
 * and not the README. `--help` lists the flags; this says what `--json` hands
 * you, why a runner is missing, and how to add a tool.
 *
 * Sections are data, so `tests/guide.test.ts` can check each one against the
 * code it describes. No roster is retyped: the built-in tools come from
 * `builtins` and the settable keys from `CONFIG_KEYS`.
 */

import { EXIT, type CliIo } from '@osdlc/cli-tool'
import { builtins } from '@osdlc/system-model/builtins'

import {
  APP,
  BIN,
  CONFIG_ENV_VAR,
  LEGACY_APP,
  LEGACY_CONFIG_ENV_VAR,
  LEGACY_PROJECT_CONFIG_FILENAME,
  PROJECT_CONFIG_FILENAME,
} from './app.ts'
import { CONFIG_KEYS } from './config.ts'
import { GROUPS } from './groups.ts'

/** One section of the guide. The document is these, in this order. */
export type GuideTopic = 'usage' | 'config' | 'json' | 'trust' | 'extend'

export const GUIDE_TOPICS: readonly GuideTopic[] = ['usage', 'config', 'json', 'trust', 'extend']

/**
 * What the guide takes from the CLI. `usage` is the same string `--help --all`
 * prints, so the guide's flag list and the help cannot drift.
 */
export interface GuideTool {
  usage: string
  extraUsage?: string | undefined
}

function isGuideTopic(value: string): value is GuideTopic {
  return (GUIDE_TOPICS as readonly string[]).includes(value)
}

const code = '```'

/** The built-in runner ids, as an inline list. */
function runnerRoster(): string {
  return builtins
    .filter((t) => t.roles.runner !== undefined)
    .map((t) => `\`${t.id}\``)
    .join(', ')
}

/** The built-in runners that must shell out to be read. */
function execRoster(): string {
  const ids = builtins.filter((t) => t.roles.runner?.kind === 'exec').map((t) => `\`${t.id}\``)
  return ids.length > 0 ? ids.join(', ') : '(none)'
}

function configKeyList(): string {
  return CONFIG_KEYS.map((k) => `\`${k}\``).join(', ')
}

function groupList(): string {
  return GROUPS.map(
    (g) => `- \`${g.id}\`: ${g.title}${g.runner ? ` (runner \`${g.runner}\`)` : ''}`,
  ).join('\n')
}

/**
 * The tool example. `tests/guide-example.ts` holds the same code as a module
 * the typechecker compiles, and `tests/guide.test.ts` checks the two match.
 */
export const EXTEND_EXAMPLE = `import type { ToolDef } from '@osdlc/system-model/detect'

export const tools: ToolDef[] = [
  {
    id: 'acme',
    binary: 'acme',
    markers: [{ files: '/acme.json', tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: [{ label: 'task', hint: 'the acme task to run' }],
        async collect(ctx) {
          const config = (await ctx.readJson('acme.json')) as { tasks?: string[] } | null
          const tasks = (config?.tasks ?? []).map((name) => ({
            id: \`acme:\${name}\`,
            runner: 'acme',
            path: ['acme', name],
            argv: ['acme', 'run', name],
            cwd: '.',
            display: \`acme run \${name}\`,
            parameters: [],
            source: 'acme.json',
            origin: 'declared' as const,
            tags: [],
            persistent: { value: false, declared: false },
            executes: 'local' as const,
          }))
          return { status: 'ok', tasks, diagnostics: [] }
        },
      },
    },
  },
]
`

const JSON_EXAMPLE = `{
  "schemaVersion": 1,
  "kind": "catalog",
  "root": "/home/you/repo",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "discovery": "git",
  "allowExec": false,
  "reports": [
    {
      "runner": "just",
      "status": "ok",
      "chain": [{ "label": "recipe", "hint": "the recipe to run" }],
      "tasks": [
        {
          "id": "just:justfile:build",
          "runner": "just",
          "path": ["just", ".", "build"],
          "argv": ["just", "build"],
          "cwd": ".",
          "display": "just build <target>",
          "parameters": [{ "name": "target", "required": true, "variadic": false }],
          "source": "justfile",
          "origin": "declared",
          "doc": "build one crate",
          "tags": [],
          "persistent": { "value": false, "declared": false },
          "executes": "local"
        }
      ],
      "diagnostics": [],
      "tool": { "binary": "just", "found": true, "path": "/usr/bin/just" },
      "skippedForExec": false
    }
  ],
  "groups": [{ "id": "tasks", "title": "Tasks", "runners": ["just"] }],
  "cache": [{ "runner": "just", "state": "fresh", "ageMs": 0, "probeMs": 12, "estimateMs": 12, "slow": false }],
  "unknowns": [],
  "filter": {}
}`

function usageSection(tool: GuideTool): string {
  const extra = tool.extraUsage === undefined ? '' : `\n${tool.extraUsage.trim()}\n`
  return `## usage

\`${BIN}\` lists every task this repository can run, and runs one.

Point it at a directory; the directory is resolved upward to the project root,
so running from a subdirectory still inspects the whole repository.

${code}text
${tool.usage.trim()}
${code}
${extra}
Built-in runners: ${runnerRoster()}.

Rows come in groups. Tasks come from runners. Dependencies (installs and
frozen installs), Tools (\`mise install\`, \`mise trust\`, \`direnv allow\`) and
Git hooks (arming the hooks, and each hook as a task you can run by hand) are
synthesized from the package, tool and hook managers found. Every row is a
task, so search, run and arguments work the same for all of them.

Subcommands: \`config\` reads and writes the layered settings, \`trust\` records
that this repository may be read by running it, \`providers\` lists the
registered tools, \`clean\` removes the data ${APP} stores outside your
repositories, \`guide\` prints this document. Each takes \`--help\`. They are
claimed before the flag parse, so their own arguments are not read as this
tool's flags.
`
}

function configSection(): string {
  return `## config

Layers, lowest precedence first:

1. The built-in defaults, with \`allowExec: true\`: willing in principle,
   still gated on trust.
2. The user file.
3. The project file.
4. Flags on this command line.

Files. The project file is \`${PROJECT_CONFIG_FILENAME}\` at the project root, the
root this tool resolved, not the working directory. The user file is
\`$XDG_CONFIG_HOME/${APP}/config.json\`, or \`~/.config/${APP}/config.json\` when
that variable is unset or relative.

\`${CONFIG_ENV_VAR}\` replaces the USER file's location and nothing else. It does
not move the project file and it does not add a layer. A path in it may start
with a tilde, which is expanded. A relative path is ignored with a warning,
because from the project root it would name a file in the repository.

Old names. The tool was called ${LEGACY_APP} before its first release.
\`${LEGACY_CONFIG_ENV_VAR}\`, \`$XDG_CONFIG_HOME/${LEGACY_APP}/config.json\` and
\`${LEGACY_PROJECT_CONFIG_FILENAME}\` are still read when the new name is absent,
with a warning naming the new location.

Settable keys: ${configKeyList()}.

Merging. Objects merge key by key. An ARRAY answers "which ones" wholesale, so
a later layer replaces it rather than appending to it: \`--exclude\` REPLACES
\`runners.disabled\`, and \`--exclude-path\` replaces \`excludePaths\`.

\`runners.disabled\` turns a RUNNER off everywhere in this project.
\`excludePaths\` leaves every runner on and narrows WHERE they look, for a tree
that holds manifests nobody runs, such as a test-fixture repository. A bare
name matches any path segment; a value with a slash matches from the root and
takes the tree beneath it. Not glob syntax.

\`tools\` names modules that export more tools (see extend). A relative path
resolves against the file that names it.

Exit codes. 2 means the command cannot be run as typed: an unknown
subcommand, a wrong argument count, an unknown setting, a value of the wrong
type. 1 means a well-formed command failed against the state: a file that
will not parse, a key that is not set where you asked to unset it.

The project file cannot grant execution. It may LOWER \`allowExec\` to false,
never raise it, because it lives inside the repository being scanned. A
project file's \`allowExec: true\` and any trust block are dropped with a
warning. Its \`tools\` load only when the repository is trusted and execution
is allowed, since a tool module is code.

The effective gate: \`--no-exec\` forbids execution whatever is configured;
\`--exec\` allows it for that one run; with neither flag, execution needs a
configured \`allowExec\` of true and a trusted repository.
`
}

function jsonSection(): string {
  return `## json

Every command answers \`--json\` with one JSON document whose first fields are
\`schemaVersion\` and \`kind\`. \`${BIN} schema\` prints each one's JSON Schema, and
\`@osdlc/wayfinder/schema\` exports them. \`${BIN} list --json\` prints the
catalog document (\`kind\` "catalog"). Field by field:

\`Catalog\`
- \`root\`: absolute path the collection ran against. Every \`cwd\` and
  \`source\` below is relative to it.
- \`generatedAt\`: ISO timestamp of this collection.
- \`discovery\`: "git" or "walk", how file discovery resolved.
- \`allowExec\`: whether runners were permitted to run subprocesses.
- \`reports\`: one entry per runner, grouped, then in configured order.
- \`groups\`: the non-empty groups in display order, each
  \`{ id, title, runners }\`. The ids:

${groupList()}

\`Task\`
- \`id\`: stable across a re-collect.
- \`runner\`: the owning runner's id.
- \`path\`: display and search chain, root first, with \`runner\` at index 0.
- \`argv\`: EXECUTABLE. Spawn it directly, never through a shell. It carries no
  parameter placeholders. To add arguments, use the way the tool expects:
  ${BIN} puts them after \`--\` for npm, cargo, moon and the like.
- \`display\`: for showing and copying. It may carry \`<required>\`,
  \`[optional]\` and \`*variadic\` markers, so it is NOT executable.
- \`cwd\`: directory the command expects, relative to the root ("." = root).
- \`parameters\`: each \`{ name, required, variadic, default? }\`.
- \`source\`: the file that declares the task.
- \`origin\`: "declared" means written in a file; "synthesized" means made from
  a convention, such as \`cargo test\` for a crate or an install for a lockfile.
- \`doc\`, \`detail\`: a summary, and what the task executes when that differs
  from \`display\`. Absent when the runner supplies none.
- \`tags\`: free-text facets for search and filtering.
- \`persistent\`: \`{ value, declared }\`. \`declared\` separates the runner
  stating it from a guess from the task name.
- \`executes\`: "local", "remote" or "container".

\`RunnerReport\`
- \`runner\`, \`status\` ("absent", "ok" or "error"), \`tasks\`.
- \`chain\`: one \`{ label, hint }\` per position of \`Task.path\`.
- \`diagnostics\`: each \`{ severity, message, source? }\`.
- \`brand\`: optional icon and colour.
- \`tool\`: \`{ binary, found, path? }\`, from a PATH lookup. Absent when the
  tool declares no binary.
- \`skippedForExec\`: true when the runner was withheld because it needed to
  shell out.

\`cache\`: one entry per runner:
- \`state\`: "fresh", "stale" (used, and out of date) or "miss" (nothing was
  stored).
- \`reason\`: why a stale row is stale, such as "changed".
- \`ageMs\`: how old the stored answer is; 0 when probed just now.
- \`probeMs\`: how long the probe took, when it ran in this call.
- \`estimateMs\`: the expected re-probe cost, or null when never measured.
- \`slow\`: true when those measurements say this runner is slow here.

\`unknowns\`: what could not be read, each with the \`label\` the terminal
shows: \`withheld\` runners, tasks whose \`parameters\` are unknown, \`stale\`
stored answers and a \`binary\` not on the PATH.

\`filter\`: the filters \`--services\`, \`--declared\` and \`--depth\` applied.

A cached \`generatedAt\` is the OLDEST contributing probe time.

Over HTTP, \`${BIN} serve\` adds \`trustable\`, the server's own reading of
the gate it resolved.

Trimmed example:

${code}json
${JSON_EXAMPLE}
${code}
`
}

function trustSection(): string {
  return `## trust

Reading some runners means RUNNING them. Asking moon for its task graph
evaluates the repository's toolchain configuration, and asking mise for its
tasks can fire that repository's hooks. Pointing a tool at a repository you
did not write is code execution before you have run anything from the list.

Built-ins that must shell out: ${execRoster()}.

The store is \`$XDG_STATE_HOME/${APP}/trusted/\`, or
\`~/.local/state/${APP}/trusted/\` when that variable is unset: state, not
config, so consent does not travel in a dotfiles repository. One marker file
per trusted root. Grants in the old \`$XDG_STATE_HOME/${LEGACY_APP}/trusted/\`
store still count.

It is PATH-KEYED: the key is the absolute, symlink-resolved root, not a hash
of the contents. A repository you trusted that later pulls hostile changes
STAYS trusted, and \`${BIN} trust --untrust\` is the remedy. Hashing every
runner config would re-prompt on ordinary edits, which trains people to
approve without reading.

How the gate resolves:

${code}text
flag        configured  trusted  effective allowExec  reason
--no-exec   any         any      false               configured-off
--exec      any         any      true                allowed-by-flag
(none)      false       any      false               configured-off
(none)      true        false    false               untrusted
(none)      true        true     true                allowed
${code}

The exec flag grants execution for ONE run and records nothing.

The command: \`${BIN} trust\` grants, \`--untrust\` revokes, \`--show\` reports
this root, \`--list\` prints every trusted path. \`-C PATH\` reaches all of them.

A root can also be trusted with no marker, by a trust block in the USER
config: \`trust.paths\` (a glob over the resolved root) and \`trust.owners\`
(the \`origin\` remote's \`host/owner\`; a bare owner means github.com), decided in
that order after the marker.
\`--show\` and \`--json\` name which layer decided (\`by\`:
\`marker\`/\`path\`/\`owner\`, plus the matching \`rule\` for a policy hit).
`
}

function extendSection(): string {
  return `## extend

A tool is a \`ToolDef\` from \`@osdlc/system-model/detect\`, the same shape as
the built-ins: an id, the binary, the files that show it is in use, and the
roles it plays. A tool with a \`runner\` role adds tasks.

Two rules for a runner.

1. It never spawns. \`ctx.runner(binary)\` hands back an injected runner.
2. It never reads the filesystem for discovery. \`ctx.files()\` applies the
   caller's discovery, git-tracked or a directory walk.

\`kind\` is "parse" or "exec". This is a trust boundary: a parse runner reads
files; an exec runner runs the repository's code to be read, so it is
withheld until the repository is trusted.

The context gives \`root\`, \`files(pattern)\`, \`readJson(path)\`,
\`readText(path)\`, \`exists(path)\`, \`which(binary)\`, \`runner(binary)\`,
\`allowExec\`, \`discovery\` and \`signal\`.

A complete module:

${code}ts
${EXTEND_EXAMPLE.trim()}
${code}

Load it:

- for one run: \`${BIN} --config ./acme-tools.js\` (repeatable);
- always: \`${BIN} config set tools '["./acme-tools.js"]' --user\`;
- for one repository: \`tools\` in \`${PROJECT_CONFIG_FILENAME}\`, which loads only
  when the repository is trusted and execution is allowed.

The module exports \`tools\`, an array, or a default that is an array or has
\`tools\`. Node loads it, so write JavaScript, or TypeScript on a Node that
strips types. A tool whose id matches a built-in is an error.
\`${BIN} providers\` lists every registered tool and where it came from.
`
}

/** One section. Always ends with a newline. */
export function guideSection(topic: GuideTopic, tool: GuideTool): string {
  switch (topic) {
    case 'usage':
      return usageSection(tool)
    case 'config':
      return configSection()
    case 'json':
      return jsonSection()
    case 'trust':
      return trustSection()
    case 'extend':
      return extendSection()
  }
}

/** Every section, in {@link GUIDE_TOPICS} order, under one title. */
export function guideDocument(tool: GuideTool): string {
  const header = `# ${APP} guide

Instructions for using and extending this tool without the README. Topics:
${GUIDE_TOPICS.join(', ')}. Print one with \`${BIN} guide <topic>\`.
`
  return [header, ...GUIDE_TOPICS.map((t) => guideSection(t, tool))].join('\n')
}

/** `way guide --help`. Short on purpose: the document is the real help. */
function guideUsage(): string {
  return `${BIN} guide — how to use and extend ${APP}, without the README

usage: ${BIN} guide [topic]

  (no topic)          the whole document
  topics              the topic names, one per line
  <topic>             one section: ${GUIDE_TOPICS.join(', ')}
  -h, --help          this text
`
}

/** `way guide …`. Returns the exit code. */
export function runGuideCommand(tool: GuideTool, argv: string[], io: CliIo): number {
  if (argv.length === 0) {
    io.stdout(guideDocument(tool))
    return EXIT.ok
  }

  const [first, ...rest] = argv as [string, ...string[]]
  if (first === '-h' || first === '--help') {
    io.stdout(guideUsage())
    return EXIT.ok
  }

  const bad = (what: string): number => {
    io.stderr(`${APP}: guide: ${what} — topics are: ${GUIDE_TOPICS.join(', ')} (or "topics")\n`)
    return EXIT.usage
  }

  if (rest.length > 0) return bad('expected at most one topic')
  if (first === 'topics') {
    io.stdout(`${GUIDE_TOPICS.join('\n')}\n`)
    return EXIT.ok
  }
  if (isGuideTopic(first)) {
    io.stdout(guideSection(first, tool))
    return EXIT.ok
  }
  return bad(`unknown topic "${first}"`)
}
