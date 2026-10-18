/**
 * Tests of the CLI and the folder runner over the fixture corpus in `tests/fixtures/corpus/`:
 * in-process through `runCli` and `runCorpus`, and as the built `markdown-contract` program, run
 * directly and through a symbolic link as `node_modules/.bin` installs it.
 *
 * The corpus config imports the package by name, which resolves to the built dist/, so these
 * tests rely on the build in `tests/global-setup.ts`.
 *
 * The corpus holds two clean documents (a decision and a task) and one bad decision, whose
 * status is outside the enum and which misses a required section: two error-level findings.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { CorpusConfig, Finding } from '../index.js'
import { runCorpus } from '../index.js'
import { runCli } from './index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..')
const CORPUS = resolve(HERE, '../../tests/fixtures/corpus')
const CONFIG = resolve(CORPUS, 'markdown-contract.config.mjs')
const CLEAN_SUBTREE = resolve(CORPUS, 'tasks') // only the clean task lives here

/** Load the corpus config the same way `runCli`/the bin do — via a real Node import. */
async function loadConfig(): Promise<CorpusConfig> {
  const mod = (await import(pathToFileURL(CONFIG).href)) as { default: CorpusConfig }
  return mod.default
}

describe('runCli — usage errors', () => {
  test('validate takes one path; a second path exits 2', async () => {
    const r = await runCli(['validate', CORPUS, CLEAN_SUBTREE, '--config', CONFIG], { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('validate takes one <path>')
  })

  test.each([
    [['validate', CORPUS, '--config', CONFIG, '--write'], '--write does not apply to validate'],
    [['validate', CORPUS, '--config', CONFIG, '--meta'], '--meta does not apply to validate'],
    [['migrate', 'a.yaml', '--format', 'json'], '--format does not apply to migrate'],
    [['init', CORPUS, '--contract', 'c.yaml'], '--contract does not apply to init'],
  ])('a flag from another command is rejected: %j', async (argv, message) => {
    const r = await runCli(argv, { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain(message)
  })

  test('--infer-bounds is not a flag', async () => {
    const r = await runCli(['init', CORPUS, '--infer-bounds'], { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('infer-bounds')
  })

  test('an unknown command name that is an Object property is still unknown', async () => {
    const r = await runCli(['toString'], { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('unknown command "toString"')
  })
})

describe('runCli — in-process over the fixture corpus', () => {
  test('failing corpus → exit 1 (the bad decision has error-level findings)', async () => {
    const r = await runCli(['validate', CORPUS, '--config', CONFIG], { cwd: CORPUS })
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('finding(s)')
  })

  test('clean subtree → exit 0 (scoping to tasks/ covers only the clean task)', async () => {
    const r = await runCli(['validate', CLEAN_SUBTREE, '--config', CONFIG], { cwd: CORPUS })
    expect(r.code).toBe(0)
    expect(r.stderr).toBe('')
  })

  test('--format json parses and contains the expected finding ids', async () => {
    const r = await runCli(['validate', CORPUS, '--config', CONFIG, '--format', 'json'], {
      cwd: CORPUS,
    })
    expect(r.code).toBe(1)
    const findings = JSON.parse(r.stdout) as Finding[]
    expect(Array.isArray(findings)).toBe(true)
    const ids = findings.map((f) => f.id)
    // The bad decision fires a frontmatter enum error and a missing-section error.
    expect(ids).toContain('frontmatter/enum')
    expect(ids).toContain('structure/section-missing')
    // Every finding carries its file path (stamped by ctx.path).
    expect(findings.every((f) => typeof f.path === 'string' && f.path.length > 0)).toBe(true)
  })

  test('--format sarif parses and is SARIF 2.1.0-shaped', async () => {
    const r = await runCli(['validate', CORPUS, '--config', CONFIG, '--format', 'sarif'], {
      cwd: CORPUS,
    })
    const log = JSON.parse(r.stdout) as {
      version: string
      $schema: string
      runs: Array<{
        tool: { driver: { name: string; rules: Array<{ id: string }> } }
        results: Array<{
          ruleId: string
          level: string
          message: { text: string }
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>
        }>
      }>
    }
    expect(log.version).toBe('2.1.0')
    expect(typeof log.$schema).toBe('string')
    expect(log.runs[0]?.tool.driver.name).toBe('markdown-contract')
    const results = log.runs[0]?.results ?? []
    expect(results.length).toBeGreaterThan(0)
    expect(results.map((x) => x.ruleId)).toContain('frontmatter/enum')
    // SARIF levels map error→error; the enum finding is error-level.
    expect(results.some((x) => x.level === 'error')).toBe(true)
    expect(results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBeTruthy()
  })

  test('missing config → exit 2 with a clear message', async () => {
    const r = await runCli(['validate', CORPUS, '--config', resolve(CORPUS, 'nope.mjs')], {
      cwd: CORPUS,
    })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('config not found')
  })

  test('unsupported .ts config → exit 2', async () => {
    const r = await runCli(
      ['validate', CORPUS, '--config', resolve(CORPUS, '..', '..', 'harness.ts')],
      { cwd: CORPUS },
    )
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('unsupported config extension')
  })

  test('unknown command → exit 2', async () => {
    const r = await runCli(['frobnicate'], { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('unknown command')
  })

  test('--help → usage on stdout, exit 0', async () => {
    const r = await runCli(['--help'], { cwd: CORPUS })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('usage:')
  })

  test('no args → usage on stderr, exit 2', async () => {
    const r = await runCli([], { cwd: CORPUS })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('usage:')
  })

  test('bad --format → exit 2', async () => {
    const r = await runCli(['validate', CORPUS, '--config', CONFIG, '--format', 'xml'], {
      cwd: CORPUS,
    })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('unknown --format')
  })
})

describe('runCorpus — pure library API', () => {
  test('aggregates findings and returns exit 1 on an error-level finding', async () => {
    const config = await loadConfig()
    const { findings, exitCode } = runCorpus(config, { cwd: CORPUS })
    expect(exitCode).toBe(1)
    expect(findings.some((f) => f.level === 'error')).toBe(true)
  })

  test('clean subtree aggregates no error-level finding ⇒ exit 0', async () => {
    const config = await loadConfig()
    const { findings, exitCode } = runCorpus(config, { cwd: CLEAN_SUBTREE })
    expect(exitCode).toBe(0)
    expect(findings.some((f) => f.level === 'error')).toBe(false)
  })
})

const BIN = resolve(REPO, 'dist/cli/bin.js')

describe('the built program', () => {
  test('spawn the real bin over the corpus → exit 1, parseable json stdout', () => {
    const r = spawnSync('node', [BIN, 'validate', CORPUS, '--config', CONFIG, '--format', 'json'], {
      cwd: CORPUS,
      encoding: 'utf8',
    })
    expect(r.status).toBe(1)
    const findings = JSON.parse(r.stdout) as Finding[]
    expect(Array.isArray(findings)).toBe(true)
    expect(findings.map((f) => f.id)).toContain('frontmatter/enum')
  })

  test('spawn the real bin over the clean subtree → exit 0', () => {
    const r = spawnSync('node', [BIN, 'validate', CLEAN_SUBTREE, '--config', CONFIG], {
      cwd: CORPUS,
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
  })

  test('runs through a symbolic link, as node_modules/.bin installs it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-bin-'))
    try {
      const link = join(dir, 'markdown-contract')
      symlinkSync(BIN, link)
      const failing = spawnSync('node', [link, 'validate', CORPUS, '--config', CONFIG], {
        cwd: CORPUS,
        encoding: 'utf8',
      })
      expect(failing.status).toBe(1)
      expect(failing.stdout).toContain('frontmatter/enum')
      const clean = spawnSync('node', [link, 'validate', CLEAN_SUBTREE, '--config', CONFIG], {
        cwd: CORPUS,
        encoding: 'utf8',
      })
      expect(clean.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('importing ./cli runs nothing', async () => {
    const r = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(resolve(REPO, 'dist/cli/index.js'))})`,
      ],
      { cwd: CORPUS, encoding: 'utf8' },
    )
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
  })
})
