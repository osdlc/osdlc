/**
 * `@osdlc/cli-tool/command` used the way a consumer uses it: a small tool
 * declared as a command tree, run in process. Every export of the entry
 * appears here at least once. `tests/exports.test.ts` checks that.
 */

import { expect, test } from 'vitest'
import { z } from 'zod'

import {
  BUILTIN_FLAGS,
  CommandError,
  HelpEntrySchema,
  UNIVERSAL_EXITS,
  UsageError,
  commandKit,
  defineApp,
  defineCommand,
  defineGroup,
  isGroup,
  isInteractive,
  loadCommandTree,
  outcome,
  treeFromFiles,
  type App,
  type AppSpec,
  type Command,
  type CommandCommon,
  type CommandContext,
  type CommandFile,
  type CommandInput,
  type CommandKit,
  type CommandResult,
  type DataCommand,
  type DataCommandSpec,
  type Group,
  type GroupSpec,
  type HelpEntry,
  type HelpExit,
  type HelpFlag,
  type HelpPositional,
  type InteractiveCommand,
  type InteractiveCommandSpec,
  type JsonSchema,
  type Node,
  type Outcome,
  type OutputSchema,
  type SchemaEntry,
} from '@osdlc/cli-tool/command'
import { runApp } from '@osdlc/cli-tool/testing'

// The flags every command takes. The kit types them into `input.globals`.
const GLOBALS = {
  dir: { kind: 'string', short: 'C', valueName: 'path', help: 'the repository (default: cwd)' },
} as const
const kit: CommandKit<typeof GLOBALS> = commandKit({ globals: GLOBALS })

const Branch = z.object({ name: z.string(), merged: z.boolean() })
const ListOutput = z.object({ branches: z.array(Branch) })

const branches = [
  { name: 'main', merged: false },
  { name: 'old-fix', merged: true },
]

// A data command: flags, output, and a text form. `--json` comes for free.
const listSpec: DataCommandSpec<
  { merged: { kind: 'boolean'; help: string } },
  typeof GLOBALS,
  typeof ListOutput
> = {
  summary: 'the branches, and which are merged',
  flags: { merged: { kind: 'boolean', help: 'only merged branches' } },
  output: ListOutput,
  kind: 'branches',
  readOnly: true,
  run(
    input: CommandInput<{ merged: { kind: 'boolean'; help: string } }, typeof GLOBALS>,
    ctx: CommandContext,
  ) {
    if (input.globals.dir === '/nowhere')
      throw new CommandError('not a repository', { hint: 'pass -C' })
    const shown = branches.filter((b) => !input.flags.merged || b.merged)
    ctx.note(`${shown.length} branch(es) in ${input.globals.dir ?? ctx.cwd}`)
    return { branches: shown }
  },
  text: (o) => o.branches.map((b) => `${b.merged ? '*' : ' '} ${b.name}\n`).join(''),
}
const list: DataCommand = kit.command(listSpec) as DataCommand

// A domain outcome: the answer is printed, and the exit code says "nothing to do".
const sweep = kit.command({
  summary: 'delete merged branches',
  flags: { force: { kind: 'boolean', help: 'delete without asking' } },
  exits: { 10: 'nothing to delete' },
  output: z.object({ deleted: z.array(z.string()) }),
  run({ flags }): CommandResult<{ deleted: string[] }> {
    const merged = branches.filter((b) => b.merged).map((b) => b.name)
    if (merged.length === 0) return outcome({ deleted: [] }, 10)
    if (!flags.force) throw new UsageError('sweep deletes branches; pass --force')
    return { deleted: merged }
  },
})

// An interactive command has no JSON form.
const browseSpec: InteractiveCommandSpec<Record<never, never>, typeof GLOBALS> = {
  summary: 'browse the branches in a terminal UI',
  interactive: true,
  run(_input, ctx) {
    ctx.io.stdout('(a terminal UI would draw here)\n')
  },
}
const browse: InteractiveCommand = kit.command(browseSpec) as InteractiveCommand

const groupSpec: GroupSpec = {
  summary: 'work with branches',
  default: list,
  commands: { list, sweep },
}
const branch: Group = kit.group(groupSpec)

const spec: AppSpec<typeof GLOBALS> = {
  name: 'sweep',
  version: '0.3.0',
  summary: 'say what has been merged and can go away',
  globals: GLOBALS,
  default: browse,
  commands: { branch },
}
const app: App = defineApp(spec)

test('a data command answers as text, or as one JSON document', async () => {
  const text = await runApp(app, ['branch', '--merged'])
  expect(text.out).toBe('* old-fix\n')
  expect(text.err).toBe('sweep: 1 branch(es) in ' + process.cwd() + '\n')

  const json = await runApp(app, ['-C', '/repo', 'branch', 'list', '--json'])
  expect(json.json()).toEqual({ schemaVersion: 1, kind: 'branches', branches })
})

test('errors pick the exit code', async () => {
  expect((await runApp(app, ['branch', '-C', '/nowhere'])).err).toBe(
    'sweep: not a repository\npass -C\n',
  )
  expect((await runApp(app, ['branch', 'sweep'])).exit).toBe(2)
  expect((await runApp(app, ['branch', 'sweep', '--force', '--json'])).json()).toMatchObject({
    deleted: ['old-fix'],
  })
  expect((await runApp(app, ['--json'])).exit).toBe(2)
  expect((await runApp(app, ['--version'])).out).toBe('sweep 0.3.0\n')
})

test('help is progressive, and its JSON says the same', async () => {
  expect((await runApp(app, ['help'])).out).toContain(
    'commands:\n  branch  work with branches (2 commands)',
  )
  expect((await runApp(app, ['help', '--depth', '2'])).out).toContain(
    '    sweep  delete merged branches',
  )
  const full = await runApp(app, ['branch', 'sweep', '--help', '--all'])
  expect(full.out).toContain('  10  nothing to delete')

  const entry: HelpEntry = app.help(['branch', 'sweep'], { full: true })
  expect(HelpEntrySchema.safeParse(entry).success).toBe(true)
  const flags: HelpFlag[] = entry.flags ?? []
  const exits: HelpExit[] = entry.exits ?? []
  const positionals: HelpPositional[] = entry.positionals ?? []
  expect(flags.map((f) => f.name)).toEqual(['force', 'dir', 'json', 'help', 'all'])
  expect(Object.keys(BUILTIN_FLAGS)).toEqual(['json', 'help', 'all'])
  expect(exits.slice(0, UNIVERSAL_EXITS.length)).toEqual(UNIVERSAL_EXITS)
  expect(positionals).toEqual([])
})

test('schema prints each command input and output schema', async () => {
  const entries: SchemaEntry[] = app.schema(['branch', 'list'])
  const output: JsonSchema = entries[0]!.output!
  expect(output['required']).toEqual(['schemaVersion', 'kind', 'branches'])
  expect(app.documentSchema(['branch'])).toEqual(output)
  expect(
    app.documentContract(['branch']).safeParse({ schemaVersion: 1, kind: 'branches', branches })
      .success,
  ).toBe(true)
  const doc = (await runApp(app, ['schema', '--json'])).json<{ commands: SchemaEntry[] }>()
  expect(doc.commands.map((c) => c.command)).toContain('sweep branch sweep')
})

test('the tree can come from files', async () => {
  const fromDir = await loadCommandTree(new URL('./commands/', import.meta.url), {
    summary: 'greet',
  })
  const hello = defineApp({ name: 'hi', version: '1.0.0', summary: 'greet', commands: fromDir })
  expect((await runApp(hello, ['hello', 'ann'])).out).toBe('hello, ann\n')

  // A bundler that collects the modules itself passes them as a list.
  const say: Command = defineCommand({ summary: 'say', output: z.object({}), run: () => ({}) })
  const files: CommandFile[] = [
    { path: ['speak'], index: true, node: defineGroup({ summary: 'speaking' }) },
    { path: ['speak', 'say'], index: false, node: say },
  ]
  const tree: Group = treeFromFiles(files, { summary: 'greet' })
  const node: Node = tree.commands['speak']!
  expect(isGroup(node)).toBe(true)
  expect(isInteractive(browse)).toBe(true)
})

// The remaining types, named so a reader sees what each one is for.
type _Types = [CommandCommon<Record<never, never>>, Outcome<object>, OutputSchema]
const _unused: _Types | undefined = undefined
void _unused
