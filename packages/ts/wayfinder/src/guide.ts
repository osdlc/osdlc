/**
 * `way guide`: cli-tool's shared `guide` command over wayfinder's topics,
 * Markdown for a person or a model who has the binary and not the README.
 * `--help` lists the flags; this says what `--json` hands you, why a runner is
 * missing, and how to add a tool.
 *
 * Sections are data, so `tests/guide.test.ts` can check each one against the
 * code it describes. No roster is retyped: the built-in tools come from
 * `builtins` and the settable keys from `CONFIG_KEYS`.
 */

import type { CommandContext, DataCommand } from '@osdlc/cli-tool/command'
import type { FlagSpec } from '@osdlc/cli-tool/define-cli'
import { guideCommand as sharedGuideCommand, type GuideTopic } from '@osdlc/cli-tool/guide'
import { builtins } from '@osdlc/system-model/builtins'

import { APP, BIN, CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME } from './app.ts'
import { CONFIG_KEYS, OPEN_VALUES, THEME_VALUES } from './config.ts'
import { GROUPS } from './groups.ts'

/** One section of the guide. The document is these, in this order. */
export type GuideTopicId = 'usage' | 'config' | 'json' | 'trust' | 'extend'

export const GUIDE_TOPICS: readonly GuideTopicId[] = ['usage', 'config', 'json', 'trust', 'extend']

/** One line per topic, for `guide topics`. */
const SUMMARIES: Record<GuideTopicId, string> = {
  usage: 'the surfaces, the flags and the row groups',
  config: 'the layered settings files and every key',
  json: 'what --json prints, field by field',
  trust: 'why some runners need trust, and how it is decided',
  extend: 'adding your own tools',
}

/**
 * What the guide takes from the CLI. `usage` is the same string the complete
 * help prints, so the guide's flag list and the help cannot drift.
 */
export interface GuideTool {
  usage: string
  extraUsage?: string | undefined
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

function usageBody(tool: GuideTool): string {
  const extra = tool.extraUsage === undefined ? '' : `\n${tool.extraUsage.trim()}\n`
  return `\`${BIN}\` lists every task this repository can run, and runs one.

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

function configBody(): string {
  return `Layers, lowest precedence first:

1. The built-in defaults, with \`allowExec: true\`: willing in principle,
   still gated on trust.
2. The user file.
3. The project file.
4. Flags on this command line.

Files. The project file is \`${PROJECT_CONFIG_FILENAME}\` at the project root, the
root this tool resolved, not the working directory. The user file is
\`$XDG_CONFIG_HOME/${APP}/config.json\`, or \`~/.config/${APP}/config.json\` when
that variable is unset or relative; on Windows it is under \`%APPDATA%\`.
\`WAYFINDER_ROOT\` moves every file ${APP} keeps outside your repositories under
one directory.

\`${CONFIG_ENV_VAR}\` replaces the USER file's location and nothing else. It does
not move the project file and it does not add a layer. A path in it may start
with a tilde, which is expanded. A relative path is ignored with a warning,
because from the project root it would name a file in the repository.

Settable keys: ${configKeyList()}. A key under \`trust.tools\` names one tool:
\`trust.tools.<tool>.paths\`.

\`open\` is what a bare \`${BIN}\` opens: ${OPEN_VALUES.map((v) => `"${v}"`).join(' or ')}.
\`theme\` is the web view's theme: ${THEME_VALUES.map((v) => `"${v}"`).join(', ')}.
Both are personal, so only the user file may set them.

A file may start with \`"$schema"\`, naming the JSON Schema an editor checks it
against; every file ${BIN} writes has one. An unknown key is a warning that
names the closest known key, and the rest of the file still loads. A value of
the wrong type is an error.

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

\`${BIN} config explain <key>\` shows each layer's value for a key, which one won,
and why a project value was ignored.

Exit codes. 2 means the command cannot be run as typed: an unknown
subcommand, a wrong argument count, an unknown setting, a value of the wrong
type, a key the project file may not hold. 1 means a well-formed command
failed against the state: a file that will not parse, a key that is not set
where you asked to unset it.

The project file cannot grant execution. It may LOWER \`allowExec\` to false,
never raise it, because it lives inside the repository being scanned. A
project file's \`allowExec: true\`, its trust block, \`open\`, \`theme\` and
\`skills\` are dropped with a warning, and \`config set\` refuses to write them
there. Its \`tools\` load only when the repository is trusted and execution is
allowed, since a tool module is code. The web view cannot set \`allowExec\`,
\`tools\` or the trust keys.

The effective gate: \`--no-exec\` forbids execution whatever is configured;
\`--exec\` allows it for that one run; with neither flag, execution needs a
configured \`allowExec\` of true and a trusted repository.
`
}

function jsonBody(): string {
  return `Every command answers \`--json\` with one JSON document whose first fields are
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

A trust grant would help when \`unknowns\` holds a \`withheld\` entry with
reason \`untrusted\` or \`tool-untrusted\` (the web page works this out itself).

Trimmed example:

${code}json
${JSON_EXAMPLE}
${code}
`
}

function trustBody(): string {
  return `Reading some runners means RUNNING them. Asking moon for its task graph
evaluates the repository's toolchain configuration, and asking mise for its
tasks can fire that repository's hooks. Pointing a tool at a repository you
did not write is code execution before you have run anything from the list.

Built-ins that must shell out: ${execRoster()}.

The store is \`$XDG_STATE_HOME/${APP}/trusted/\`, or
\`~/.local/state/${APP}/trusted/\` when that variable is unset: state, not
config, so consent does not travel in a dotfiles repository. One marker file
per trusted root, and one per tool granted alone.

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

The command: \`${BIN} trust\` grants, \`--untrust\` revokes, \`--untrust-all\`
revokes every grant of this root, \`--show\` reports this root, \`--list\`
prints every grant. \`--scope <tool>\` grants, revokes or shows one tool's
trust instead of the whole repository's. \`-C PATH\` reaches all of them.
Granting works from the command line only: the web view cannot grant
trust.

A root can also be trusted with no marker, by a trust block in the USER
config: \`trust.paths\` (a glob over the resolved root) and \`trust.owners\`
(the \`origin\` remote's \`host/owner\`; a bare owner means github.com), decided in
that order after the marker. \`trust.tools.<tool>\` holds the same two lists for
one tool. A run needs every tool it runs trusted: a mise task needs mise as
well as its own runner.
\`--show\` and \`--json\` name which layer decided (\`by\`:
\`marker\`/\`path\`/\`owner\`, plus the matching \`rule\` for a policy hit).
`
}

function extendBody(): string {
  return `A tool is a \`ToolDef\` from \`@osdlc/system-model/detect\`, the same shape as
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

/** One section's Markdown body, without its heading. */
function guideBody(topic: GuideTopicId, tool: GuideTool): string {
  switch (topic) {
    case 'usage':
      return usageBody(tool)
    case 'config':
      return configBody()
    case 'json':
      return jsonBody()
    case 'trust':
      return trustBody()
    case 'extend':
      return extendBody()
  }
}

/** One section with its heading, as `guide <topic>` prints it. */
export function guideSection(topic: GuideTopicId, tool: GuideTool): string {
  return `## ${topic}\n\n${guideBody(topic, tool).trim()}\n`
}

/** The guide's title. */
export const GUIDE_TITLE = `${APP} guide`

/** The paragraph under the title. */
export const GUIDE_INTRO = `Instructions for using and extending this tool without the README. Topics: ${GUIDE_TOPICS.join(', ')}. Print one with \`${BIN} guide <topic>\`.`

/** Every section, in {@link GUIDE_TOPICS} order, under the title, as `guide` prints it. */
export function guideDocument(tool: GuideTool): string {
  return (
    `# ${GUIDE_TITLE}\n\n${GUIDE_INTRO}\n\n` +
    GUIDE_TOPICS.map((t) => guideSection(t, tool)).join('\n')
  )
}

/** The topics for cli-tool's `guide` command. `tool` gives the usage text for a run. */
function guideTopics(tool: (ctx: CommandContext) => GuideTool): GuideTopic[] {
  return GUIDE_TOPICS.map((id) => ({
    id,
    title: id,
    summary: SUMMARIES[id],
    body: (ctx) => guideBody(id, tool(ctx)),
  }))
}

/**
 * The `guide` command. Mount it as `guide: guideCommand({ globals })`. The
 * usage topic shows `tool(ctx).usage`; by default that is the app's complete
 * root help.
 */
export function guideCommand<G extends FlagSpec = Record<never, never>>(
  options: { globals?: G; tool?: (ctx: CommandContext) => GuideTool } = {},
): DataCommand {
  const tool = options.tool ?? ((ctx) => ({ usage: ctx.app.helpText([], { full: true }) }))
  return sharedGuideCommand(guideTopics(tool), {
    title: GUIDE_TITLE,
    intro: GUIDE_INTRO,
    ...(options.globals !== undefined ? { globals: options.globals } : {}),
  })
}
