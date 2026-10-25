/**
 * The command tree from a shell: the documents each command prints, their
 * schemas, the filters, `run`, and the framework's help, schema and version.
 */

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { afterAll, describe, expect, test, vi } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'
import type { RunnerReport } from '@osdlc/system-model/detect'
import { checkApp } from '@osdlc/cli-tool/testing'

import { GENERATED_FILE, generatedSource } from '../scripts/write-document-schemas.ts'
import { main } from '../src/cli.ts'
import { createWayApp } from '../src/commands/index.ts'
import { progressLines } from '../src/commands/list.ts'
import type { Session } from '../src/core/session.ts'
import { CatalogProgressOutput, type CatalogProgressBody } from '../src/documents.ts'
import {
  DOCUMENT_KINDS,
  DOCUMENT_SCHEMAS,
  DOCUMENT_VERSIONS,
  catalogSchema,
  cleanDocumentSchema,
  documentZod,
  trustDocumentSchema,
  type DocumentKind,
} from '../src/schema.ts'
import { fixtureRoot, removeRoot, shown } from './support.ts'

// Each case probes a fixture repository, some several times.
vi.setConfig({ testTimeout: 60_000 })

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const SCRIPTS = {
  'package.json': JSON.stringify({
    name: 'p',
    scripts: { build: 'echo b', dev: 'vite', 'exit-3': 'node -e "process.exit(3)"' },
  }),
  'apps/web/package.json': JSON.stringify({ name: 'web', scripts: { lint: 'echo s' } }),
  justfile: 'deploy env:\n    echo {{env}}\n',
  'mise.toml': '[tasks.hello]\nrun = "echo hi"\n',
}

async function way(argv: string[], dir?: string) {
  const home = dir ?? (await root({}))
  const io = captureIo()
  // -C goes first, so it never lands after a `--`.
  const code = await main(dir === undefined ? argv : ['-C', dir, ...argv], {}, home, io)
  return {
    code,
    out: io.out,
    err: io.err,
    json: () => JSON.parse(io.out) as Record<string, unknown>,
  }
}

function validates(kind: DocumentKind, doc: unknown): void {
  const checked = documentZod(kind).safeParse(doc)
  expect(checked.success, checked.success ? '' : checked.error.message).toBe(true)
}

describe('list progress lines', () => {
  test('list --json is one document, and --output jsonl has no progress lines', async () => {
    const dir = await root(SCRIPTS)
    const json = await way(['list', '--json'], dir)
    expect(json.json()['kind']).toBe('catalog')
    const lines = (await way(['list', '--output', 'jsonl'], dir)).out.trim().split('\n')
    expect(lines.map((l) => (JSON.parse(l) as { kind: string }).kind)).toEqual(
      lines.map(() => 'report'),
    )
  })

  test('--progress is in the help', async () => {
    const help = await way(['list', '--help'])
    expect(help.out).toContain('--progress')
  })

  test('a failed runner gets a line, and a report too large for one is named, not sent', () => {
    const session = { runnerOrder: () => [], unknowns: () => [] } as unknown as Session
    const lines: CatalogProgressBody[] = []
    const progress = progressLines(session, (l) => lines.push(l), 400)
    progress.onRunners!(['make', 'boom'])
    const failed: RunnerReport = {
      runner: 'boom',
      status: 'error',
      chain: [],
      tasks: [],
      skippedForExec: false,
      diagnostics: [{ severity: 'error', message: 'boom exploded' }],
    }
    const cache = { runner: 'boom', state: 'fresh', ageMs: 0, estimateMs: 1, slow: false } as const
    progress.onRunner!(failed, cache)
    const big: RunnerReport = { ...failed, runner: 'make', status: 'ok', diagnostics: [] }
    big.diagnostics = [{ severity: 'warning', message: 'x'.repeat(500) }]
    progress.onRunner!(big, { ...cache, runner: 'make' })
    expect(lines[0]).toEqual({ pending: ['boom', 'make'], total: 2 })
    expect(lines[1]).toMatchObject({
      pending: ['make'],
      report: { runner: 'boom', status: 'error' },
    })
    expect(lines[2]).toEqual({ pending: [], total: 2, omitted: 'make' })
  })

  test('the skills get a line of their own, after the line that names the runners', () => {
    const session = { runnerOrder: () => [], unknowns: () => [] } as unknown as Session
    const lines: CatalogProgressBody[] = []
    const progress = progressLines(session, (l) => lines.push(l), 600)
    const review = {
      id: 'skill:.claude/skills/review/SKILL.md',
      name: 'review',
      description: null,
      argumentHint: null,
      path: '.claude/skills/review/SKILL.md',
      scope: 'project',
      origin: 'project',
      harnesses: ['claude'],
      invoke: '/review',
    }
    // Read before the runners are known: held for the first line.
    progress.onSkills!([review])
    expect(lines).toEqual([])
    progress.onRunners!(['make'])
    expect(lines).toEqual([
      { pending: ['make'], total: 1 },
      { pending: ['make'], total: 1, skills: [review] },
    ])

    // After the first line: sent at once. None, or too many for a line: no line.
    const later = progressLines(session, (l) => lines.push(l), 600)
    lines.length = 0
    later.onRunners!(['make'])
    later.onSkills!([review])
    later.onSkills!([])
    later.onSkills!(Array.from({ length: 10 }, () => review))
    expect(lines).toEqual([
      { pending: ['make'], total: 1 },
      { pending: ['make'], total: 1, skills: [review] },
    ])
  })

  test('--progress filters the skills line like the document', async () => {
    const dir = await root({
      ...SCRIPTS,
      '.claude/skills/review/SKILL.md': '---\nname: review\ndescription: Review a PR\n---\n',
    })
    // --services keeps no skills, so the progress must not send one either.
    const lines = (await way(['list', '--progress', '--output', 'jsonl', '--services'], dir)).out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.filter((l) => l['kind'] === 'catalog-progress').length).toBeGreaterThan(0)
    expect(
      lines.filter((l) => l['skills'] !== undefined && l['kind'] === 'catalog-progress'),
    ).toEqual([])
  })

  test('--progress sends the skills line with the runner lines, and it validates', async () => {
    const dir = await root({
      ...SCRIPTS,
      '.claude/skills/review/SKILL.md': '---\nname: review\ndescription: Review a PR\n---\n',
    })
    const lines = (await way(['list', '--progress', '--output', 'jsonl'], dir)).out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    const progress = lines.filter((l) => l['kind'] === 'catalog-progress')
    const skills = progress.filter((l) => l['skills'] !== undefined)
    expect(skills).toHaveLength(1)
    expect((skills[0]!['skills'] as { name: string }[]).map((s) => s.name)).toEqual(['review'])
    for (const line of progress) {
      const { schemaVersion: _v, kind: _k, ...body } = line
      const checked = CatalogProgressOutput.safeParse(body)
      expect(checked.success, checked.success ? '' : checked.error.message).toBe(true)
    }
  })

  test('--progress sends a line per runner before the reports', async () => {
    const dir = await root(SCRIPTS)
    const lines = (await way(['list', '--progress', '--output', 'jsonl'], dir)).out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    const progress = lines.filter((l) => l['kind'] === 'catalog-progress')
    const reports = lines.filter((l) => l['kind'] === 'report')
    expect(progress.length).toBe(reports.length + 1)
    expect(lines.indexOf(progress.at(-1)!)).toBeLessThan(lines.indexOf(reports[0]!))
    // A withheld runner's line carries its reason.
    const mise = progress.find((l) => (l['report'] as { runner?: string })?.runner === 'mise')
    expect((mise!['unknowns'] as { kind: string }[]).map((u) => u.kind)).toContain('withheld')
  })
})

describe('every command answers --json with schemaVersion and kind', () => {
  test('list, query, providers and run --dry-run each print a document that validates', async () => {
    const dir = await root(SCRIPTS)
    const list = await way(['list', '--json'], dir)
    expect(list.code).toBe(0)
    expect(list.json()).toMatchObject({ schemaVersion: 1, kind: 'catalog' })
    validates('catalog', list.json())

    const query = await way(['query', 'build', '--json'], dir)
    expect(query.json()).toMatchObject({ schemaVersion: 1, kind: 'query' })
    validates('query', query.json())

    const providers = await way(['providers', '--json'], dir)
    expect(providers.json()).toMatchObject({ schemaVersion: 1, kind: 'providers' })
    validates('providers', providers.json())

    const run = await way(['run', 'npm run build', '--dry-run', '--json'], dir)
    expect(run.code).toBe(0)
    expect(run.json()).toMatchObject({
      schemaVersion: 1,
      kind: 'run',
      argv: ['npm', 'run', 'build'],
      ran: false,
      exit: null,
    })
    validates('run', run.json())
  })

  test('--version and help answer as documents too', async () => {
    const version = await way(['--version', '--json'])
    expect(version.json()).toMatchObject({ kind: 'version', name: 'way' })
    const help = await way(['help', '--json'])
    expect(help.json()).toMatchObject({ kind: 'help' })
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect((await way(['--version'])).out).toBe(`way ${pkg.version}\n`)
  })

  test('the old --json is the catalog document', async () => {
    const dir = await root(SCRIPTS)
    const old = await way(['--json'], dir)
    expect(old.json()).toMatchObject({ kind: 'catalog' })
  })
})

describe('./schema', () => {
  test('each exported schema is the one `way schema` prints for that command', () => {
    const { app } = createWayApp({ home: '/' })
    const kinds = new Set<string>()
    for (const entry of app.schema()) {
      if (entry.kind === undefined) continue
      kinds.add(entry.kind)
      expect(DOCUMENT_KINDS, entry.kind).toContain(entry.kind)
      expect(app.documentSchema(entry.path), entry.kind).toEqual(
        DOCUMENT_SCHEMAS[entry.kind as DocumentKind],
      )
      expect(DOCUMENT_VERSIONS[entry.kind as DocumentKind]).toBe(entry.schemaVersion)
    }
    // Beside the commands' documents: a failure and --version.
    expect([...DOCUMENT_KINDS].sort()).toEqual([...kinds, 'error', 'version'].sort())
    expect(DOCUMENT_SCHEMAS.trust).toBe(trustDocumentSchema)
    expect(DOCUMENT_SCHEMAS.clean).toBe(cleanDocumentSchema)
  })

  test('the generated schemas are what the command tree gives now', async () => {
    // When this fails, run `node scripts/write-document-schemas.ts` and commit the file.
    expect(await readFile(GENERATED_FILE, 'utf8')).toBe(generatedSource())
  })

  test('--version and an error validate as their documents', async () => {
    validates('version', JSON.parse((await way(['--version', '--json'])).out))
    validates('error', (await way(['run', 'nothing-here', '--json'], await root(SCRIPTS))).json())
  })

  test("the catalog document's tasks and reports are system-model's", () => {
    const props = (DOCUMENT_SCHEMAS.catalog as { properties: Record<string, unknown> }).properties
    const reports = props['reports'] as { items: { required: string[] } }
    expect(reports.items.required).toContain('skippedForExec')
    expect(catalogSchema).toMatchObject({ title: 'Catalog' })
  })

  test('the tree passes the framework checks', () => {
    expect(checkApp(createWayApp({ home: '/' }).app)).toEqual([])
  })
})

describe('filters', () => {
  test('--declared, --depth and --services keep only some tasks, in text and JSON', async () => {
    const dir = await root(SCRIPTS)
    const all = (await way(['list'], dir)).out
    expect(all).toContain('npm install')

    const declared = (await way(['list', '--declared'], dir)).out
    expect(declared).toContain('npm run build')
    // An install row is synthesized from the lockfile convention.
    expect(declared).not.toContain('npm install')

    const root0 = (await way(['list', '--depth', '0'], dir)).out
    expect(root0).toContain('npm run build')
    expect(root0).not.toContain('lint')

    const services = await way(['list', '--services', '--json'], dir)
    const tasks = (services.json()['reports'] as { tasks: { display: string }[] }[]).flatMap(
      (r) => r.tasks,
    )
    expect(tasks.map((t) => t.display)).toEqual(['npm run dev'])
    expect(services.json()['filter']).toEqual({ servicesOnly: true })

    // The old --list takes --services too.
    expect((await way(['--list', '--services'], dir)).out).toBe(`${shown('npm run dev')}\n`)
  })

  test('query takes the same filters', async () => {
    const dir = await root(SCRIPTS)
    expect((await way(['query', 'lint', '--exact', '--depth', '0'], dir)).code).toBe(1)
    expect((await way(['query', 'lint', '--exact', '--depth', '2'], dir)).out).toContain('lint')
  })

  test('--depth needs a whole number', async () => {
    const ran = await way(['list', '--depth', 'deep'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('--depth needs a whole number')
  })
})

describe('unknowns', () => {
  test('the stderr note and the JSON label are the same words', async () => {
    const dir = await root(SCRIPTS)
    const json = await way(['list', '--json'], dir)
    const unknowns = json.json()['unknowns'] as { kind: string; label: string }[]
    const params = unknowns.find((u) => u.kind === 'parameters')
    expect(params?.label).toBe(
      'parameters unknown: reading them needs execution, which is withheld',
    )
    const text = await way(['list'], dir)
    expect(text.err).toContain(`just: ${params!.label}`)
    const withheld = unknowns.find((u) => u.kind === 'withheld')
    expect(withheld).toMatchObject({ runner: 'mise', reason: 'untrusted' })
    expect(text.err).toContain('withheld')
  })
})

describe('run', () => {
  test("runs the task and exits with the task's exit code", async () => {
    const dir = await root(SCRIPTS)
    const ran = await way(['run', 'npm run exit-3'], dir)
    expect(ran.code).toBe(3)
    expect(ran.err).toContain(`$ ${shown('npm run exit-3')}`)
  })

  test('an unknown id exits 1 with the closest ids', async () => {
    const dir = await root(SCRIPTS)
    const ran = await way(['run', 'biuld'], dir)
    expect(ran.code).toBe(1)
    expect(ran.err).toContain("no task 'biuld'")
    expect(ran.err).toContain('build')
  })

  test('--json without --dry-run is a usage error, decided before any probe', async () => {
    const ran = await way(['run', 'x', '--json'], '/no/such/dir')
    expect(ran.code).toBe(2)
    expect(ran.json()).toMatchObject({ kind: 'error', code: 'usage' })
  })

  test('arguments after -- are bound the way the tool expects', async () => {
    const dir = await root(SCRIPTS)
    const ran = await way(['run', 'npm run build', '--dry-run', '--json', '--', '--watch'], dir)
    expect(ran.json()['argv']).toEqual(['npm', 'run', 'build', '--', '--watch'])
  })

  test('list prints the line Copy gives, quoted so it pastes as one command', async () => {
    const dir = await root({
      ...SCRIPTS,
      Procfile: 'web: bundle exec puma -p $PORT\n',
    })
    const listed = await way(['list'], dir)
    const lines = listed.out.split('\n')
    expect(lines).toContain(shown("sh -c 'bundle exec puma -p $PORT'"))
    expect(lines).not.toContain(shown('sh -c bundle exec puma -p $PORT'))
    const queried = await way(['query', 'puma'], dir)
    expect(queried.out).toBe(`${shown("sh -c 'bundle exec puma -p $PORT'")}\n`)
  })

  test('run takes a line list printed, and --dry-run prints it back', async () => {
    const dir = await root({ ...SCRIPTS, Procfile: 'web: bundle exec puma -p $PORT\n' })
    const line = shown("sh -c 'bundle exec puma -p $PORT'")
    const ran = await way(['run', line, '--dry-run'], dir)
    expect(ran.code).toBe(0)
    expect(ran.out).toBe(`${line}\n`)
    const json = await way(['run', 'just deploy', '--dry-run', '--json', '--', 'prod'], dir)
    expect(json.json()).toMatchObject({
      display: 'just deploy',
      command: shown('just deploy prod'),
    })
  })

  test('the run usage line shows the arguments after --', async () => {
    const help = await way(['help', 'run'])
    expect(help.out).toContain('way run [options] <id> [-- <args>...]')
  })

  test('trust --scope help names where the tool ids come from', async () => {
    const help = await way(['help', 'trust'])
    expect(help.out).toContain('way providers')
  })

  test('a task with unknown parameters says so before it runs', async () => {
    const dir = await root(SCRIPTS)
    const ran = await way(['run', 'just deploy', '--dry-run'], dir)
    expect(ran.err).toContain('parameters unknown')
  })

  test('a real run is refused to the adapters; a dry run is not', async () => {
    const { app } = createWayApp({ home: '/' })
    const refused = await app.call(['run'], { id: 'x' }, { cwd: '/', env: {} }, { surface: 'mcp' })
    expect(refused).toMatchObject({ status: 'refused', reason: 'cli-only' })
  })
})

describe('the command line', () => {
  test('a start directory that does not exist is an error naming a close command', async () => {
    const ran = await way(['lsit'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('lsit: no such directory')
    expect(ran.err).toContain('did you mean "way list"?')
    expect((await way(['list', '/no/such/dir'])).code).toBe(1)
  })

  test('a command word after global flags is the command, for shared commands too', async () => {
    const dir = await root(SCRIPTS)
    const home = await root({})
    for (const argv of [
      ['-C', dir, 'list'],
      ['list', '-C', dir],
    ]) {
      const io = captureIo()
      expect(await main(argv, {}, home, io)).toBe(0)
      expect(io.out).toContain('npm run build')
    }
    const io = captureIo()
    expect(await main(['-C', dir, 'trust', '--show'], {}, home, io)).toBe(0)
    expect(io.out).toContain(basename(dir))
  })

  test('a shared command refuses a directory that does not exist', async () => {
    const io = captureIo()
    expect(await main(['trust', '--show', '-C', '/no/such/dir'], {}, '/', io)).toBe(1)
    expect(io.err).toContain('no such directory')
  })

  test('a WAYFINDER_CONFIG that names a missing file stops a command with exit 1', async () => {
    const dir = await root(SCRIPTS)
    const io = captureIo()
    const env = { WAYFINDER_CONFIG: join(dir, 'missing.json') }
    expect(await main(['list', '-C', dir], env, dir, io)).toBe(1)
    expect(io.err).toContain('names a file that does not exist')
    expect(io.out).toBe('')
  })

  test('two surface flags are refused', async () => {
    const ran = await way(['--serve', '--list'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('each choose a surface')
    expect(ran.out).toBe('')
  })

  test('two surface flags with --json print the error document too', async () => {
    const ran = await way(['--list', '--json'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('--list and --json each choose a surface')
    expect(JSON.parse(ran.out)).toEqual({
      schemaVersion: 1,
      kind: 'error',
      code: 'usage',
      message: '--list and --json each choose a surface; give one',
      exit: 2,
      hint: '"way --help" lists the commands',
    })
  })

  test('the help lists the commands but not the contributor ones', async () => {
    const help = await way(['help'])
    for (const word of ['list', 'query', 'run', 'serve', 'providers', 'config', 'trust']) {
      expect(help.out).toContain(`  ${word}`)
    }
    expect(help.out).not.toMatch(/^\s*dev\b/m)
  })
})
