/**
 * Custom tools: a module of `ToolDef`s named by `--config`, by the user
 * file or by a trusted project file, and `way providers`, which lists them
 * beside the built-ins.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { chmodSync, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { captureIo } from '@osdlc/cli-tool'
import type { Task, ToolDef } from '@osdlc/system-model/detect'

import { runArgv } from '../src/args.ts'
import { makeProject } from '../src/catalog.ts'
import { main } from '../src/cli.ts'
import { providerRows, type ProviderRow } from '../src/providers-command.ts'

const EXAMPLE = fileURLToPath(new URL('./guide-example.ts', import.meta.url))

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wayfinder-extend-'))
  dirs.push(dir)
  return dir
}

/** A repository the guide's acme example detects. */
async function acmeRepo(config?: unknown): Promise<string> {
  const dir = await temp()
  await writeFile(join(dir, 'acme.json'), JSON.stringify({ tasks: ['build', 'ship'] }))
  if (config !== undefined)
    await writeFile(join(dir, 'wayfinder.config.json'), JSON.stringify(config))
  return dir
}

/** The acme tool as a plain JS module, for a config file to name. */
async function acmeModule(dir: string): Promise<string> {
  const file = join(dir, 'acme-tools.mjs')
  await writeFile(
    file,
    `export const tools = [{
  id: 'acme',
  binary: 'acme',
  markers: [{ files: '/acme.json', tier: 'files' }],
  roles: { runner: { kind: 'parse', async collect() {
    return { status: 'ok', diagnostics: [], tasks: [{
      id: 'acme:build', runner: 'acme', path: ['acme', 'build'], argv: ['acme', 'run', 'build'],
      cwd: '.', display: 'acme run build', parameters: [], source: 'acme.json',
      origin: 'declared', tags: [], persistent: { value: false, declared: false }, executes: 'local',
    }] }
  } } },
}]
`,
  )
  return file
}

async function run(argv: string[], home?: string) {
  const io = captureIo()
  const code = await main(argv, {}, home ?? (await temp()), io)
  return { code, out: io.out, err: io.err }
}

describe('--config', () => {
  test('a module of ToolDefs adds its tasks to the catalog', async () => {
    const dir = await acmeRepo()
    const ran = await run(['--list', '--config', EXAMPLE, '-C', dir])
    expect(ran.code).toBe(0)
    expect(ran.out.split('\n')).toEqual(expect.arrayContaining(['acme run build', 'acme run ship']))
  })

  test('without it the same repository has no acme tasks', async () => {
    const ran = await run(['--list', '-C', await acmeRepo()])
    expect(ran.out).not.toContain('acme')
  })

  test('a module that exports no tools is an error, not an empty catalog', async () => {
    const dir = await acmeRepo()
    const bad = join(dir, 'bad.mjs')
    await writeFile(bad, 'export const nothing = 1\n')
    const ran = await run(['--list', '--config', bad, '-C', dir])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('export `tools`')
  })
})

describe('tools in a config file', () => {
  test('the user file loads its modules', async () => {
    const home = await temp()
    const module = await acmeModule(home)
    await mkdir(join(home, '.config', 'wayfinder'), { recursive: true })
    await writeFile(
      join(home, '.config', 'wayfinder', 'config.json'),
      JSON.stringify({ tools: [module] }),
    )
    const ran = await run(['--list', '-C', await acmeRepo()], home)
    expect(ran.out).toContain('acme run build')
  })

  test('the project file loads its modules only once the repository is trusted', async () => {
    const dir = await acmeRepo({ tools: ['./acme-tools.mjs'] })
    await acmeModule(dir)
    const home = await temp()

    const before = await run(['--list', '-C', dir], home)
    expect(before.code).toBe(0)
    expect(before.out).not.toContain('acme')
    expect(before.err).toContain('tools not loaded')

    expect((await run(['trust', '-C', dir], home)).code).toBe(0)
    const after = await run(['--list', '-C', dir], home)
    expect(after.out).toContain('acme run build')
    expect(after.err).not.toContain('tools not loaded')
  })
})

describe('tools that must not load', () => {
  /** A tools module that leaves a file behind when it is imported. */
  async function sideEffectModule(dir: string, marker: string): Promise<void> {
    await writeFile(
      join(dir, 'side.mjs'),
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'ran')\nexport const tools = []\n`,
    )
  }

  test('a trusted project with allowExec false in the user file imports nothing', async () => {
    const dir = await acmeRepo({ tools: ['./side.mjs'] })
    const home = await temp()
    const marker = join(home, 'imported')
    await sideEffectModule(dir, marker)
    await mkdir(join(home, '.config', 'wayfinder'), { recursive: true })
    await writeFile(
      join(home, '.config', 'wayfinder', 'config.json'),
      JSON.stringify({ allowExec: false }),
    )
    expect((await run(['trust', '-C', dir], home)).code).toBe(0)

    const listed = await run(['--list', '-C', dir], home)
    expect(listed.code).toBe(0)
    expect(listed.err).toContain('tools not loaded')
    expect((await run(['providers', '-C', dir], home)).code).toBe(0)
    expect(existsSync(marker)).toBe(false)
  })

  test('--no-exec imports nothing from a trusted project either', async () => {
    const dir = await acmeRepo({ tools: ['./side.mjs'] })
    const home = await temp()
    const marker = join(home, 'imported')
    await sideEffectModule(dir, marker)
    expect((await run(['trust', '-C', dir], home)).code).toBe(0)
    await run(['--list', '--no-exec', '-C', dir], home)
    expect(existsSync(marker)).toBe(false)
    // And the same repository with execution on does import it.
    await run(['--list', '-C', dir], home)
    expect(existsSync(marker)).toBe(true)
  })
})

describe('duplicate tool ids', () => {
  test('a module that reuses a built-in id is an error naming the module', async () => {
    const dir = await temp()
    const file = join(dir, 'npm.mjs')
    await writeFile(file, "export const tools = [{ id: 'npm', roles: {} }]\n")
    const ran = await run(['--list', '--config', file, '-C', dir])
    expect(ran.code).toBe(1)
    expect(ran.err).toBe(`way: ${file}: tool "npm" is already a built-in tool\n`)
  })

  test('a module whose ecosystem id a built-in uses is an error naming the module', async () => {
    const dir = await temp()
    const file = join(dir, 'eco.mjs')
    await writeFile(
      file,
      "export const tools = [{ id: 'acme', roles: {}, ecosystem: { id: 'node', name: 'Node' } }]\n",
    )
    const ran = await run(['--list', '--config', file, '-C', dir])
    expect(ran.code).toBe(1)
    expect(ran.err).toMatch(/^way: .*"node".*\(from a tool module: .*eco\.mjs\)\n$/)
    expect(ran.err).not.toContain('    at ')
  })

  test('two modules that define one id are an error naming both', async () => {
    const dir = await acmeRepo()
    const second = await acmeModule(dir)
    const ran = await run(['--list', '--config', EXAMPLE, '--config', second, '-C', dir])
    expect(ran.code).toBe(1)
    expect(ran.err).toBe(`way: tool "acme" is defined twice: in ${EXAMPLE} and in ${second}\n`)
  })
})

describe('way providers', () => {
  test('lists every built-in with its roles, kind, binary and PATH check', async () => {
    const ran = await run(['providers', '-C', await temp()])
    expect(ran.code).toBe(0)
    const [head, ...rows] = ran.out.trimEnd().split('\n')
    expect(head).toMatch(/^tool\s+roles\s+kind\s+binary\s+on PATH\s+language\s+source\s+homepage$/)
    expect(rows.find((r) => r.startsWith('just '))).toMatch(
      /runner\s+parse\s+just\s+no\s+any language\s+built-in\s+https:\/\/just\.systems/,
    )
    expect(rows.find((r) => r.startsWith('npm '))).toMatch(/\sJavaScript\s/)
  })

  test('--json marks a tool from --config as custom, with its module', async () => {
    const ran = await run(['providers', '--json', '--config', EXAMPLE, '-C', await temp()])
    expect(ran.code).toBe(0)
    const rows = (JSON.parse(ran.out) as { providers: ProviderRow[] }).providers
    expect(rows.find((r) => r.id === 'acme')).toEqual({
      id: 'acme',
      roles: ['runner'],
      kind: 'parse',
      binary: 'acme',
      onPath: false,
      source: 'custom',
      module: EXAMPLE,
      homepage: null,
      description: null,
      ecosystem: null,
      language: 'any language',
    })
    expect(rows.find((r) => r.id === 'npm')?.source).toBe('built-in')
  })

  test('on PATH counts absolute PATH entries only, as detection does', async () => {
    const dir = await temp()
    await mkdir(join(dir, 'bin'))
    await writeFile(join(dir, 'bin', 'acme'), '#!/bin/sh\n')
    chmodSync(join(dir, 'bin', 'acme'), 0o755)
    const tool = { id: 'acme', binary: 'acme', roles: {} } as unknown as ToolDef
    const saved = process.cwd()
    process.chdir(dir)
    try {
      expect(providerRows([tool], [], { PATH: 'bin' })[0]?.onPath).toBe(false)
      expect(providerRows([tool], [], { PATH: join(dir, 'bin') })[0]?.onPath).toBe(true)
    } finally {
      process.chdir(saved)
    }
  })

  test('an unknown option is a usage error', async () => {
    const ran = await run(['providers', '--bogus'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('usage: way providers')
  })
})

describe('arguments go through the tool', () => {
  test("a custom tool's invoke decides where the arguments go", () => {
    const def: ToolDef = {
      id: 'acme',
      roles: {
        runner: {
          kind: 'parse',
          collect: () => Promise.resolve({ status: 'absent', tasks: [], diagnostics: [] }),
          invoke: (task, args) => [...task.argv, '--with', ...args],
        },
      },
    }
    const task = {
      id: 'acme:deploy',
      runner: 'acme',
      path: ['acme', 'deploy'],
      argv: ['acme', 'run', 'deploy'],
      cwd: '.',
      display: 'acme run deploy',
      parameters: [],
      source: 'acme.json',
      origin: 'declared',
      tags: [],
      persistent: { value: false, declared: false },
      executes: 'local',
    } satisfies Task
    expect(runArgv(makeProject([def]), task, ['staging'])).toEqual([
      'acme',
      'run',
      'deploy',
      '--with',
      'staging',
    ])
  })
})
