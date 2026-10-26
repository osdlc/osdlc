import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runCli } from '../../src/cli/run.js'
import { runCorpus } from '../../src/runner/index.js'
import { DeclarativeError, loadConfig, loadConfigFile } from '../../src/declarative/index.js'

const CONTRACT = `mcVersion: 2
kind: contract
body:
  order: none
  sections:
    - section: Summary
`

const CONFIG = `mcVersion: 2
kind: config
contracts:
  doc: ./doc.contract.yaml
rules:
  - include: ['*.md']
    contract: doc
`

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-dyc-config-'))
  writeFileSync(join(dir, 'doc.contract.yaml'), CONTRACT)
  writeFileSync(join(dir, 'mc.yaml'), CONFIG)
  writeFileSync(join(dir, 'good.md'), '## Summary\n\nhello\n')
  writeFileSync(join(dir, 'bad.md'), '## Other\n\nhello\n') // missing Summary → error
  mkdirSync(join(dir, 'clean'))
  writeFileSync(join(dir, 'clean', 'ok.md'), '## Summary\n\nok\n')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadConfig — YAML meta-config → CorpusConfig', () => {
  it('resolves a named .yaml contract ref and runs the corpus (failing tree → exit 1)', () => {
    const config = loadConfigFile(join(dir, 'mc.yaml'))
    expect(config.rules).toHaveLength(1)
    const r = runCorpus(config, { cwd: dir })
    expect(r.exitCode).toBe(1)
    expect(r.findings.some((f) => f.id === 'structure/section-missing')).toBe(true)
  })

  it('a clean subtree exits 0', () => {
    const config = loadConfigFile(join(dir, 'mc.yaml'))
    const r = runCorpus(config, { cwd: join(dir, 'clean') })
    expect(r.exitCode).toBe(0)
    expect(r.findings).toEqual([])
  })

  it('supports an inline contract object', () => {
    const yaml = `mcVersion: 2
kind: config
rules:
  - include: ['*.md']
    contract: { body: { order: none, sections: [ { section: Summary } ] } }
`
    const r = runCorpus(loadConfig(yaml, dir), { cwd: join(dir, 'clean') })
    expect(r.exitCode).toBe(0)
  })

  it('an inline contract compiles with the v2 compilers', () => {
    const v2 = (body: string) => `mcVersion: 2
kind: config
rules:
  - include: ['*.md']
    contract: { body: { order: none, sections: [ ${body} ] } }
`
    // v2 vocabulary works inline: minContains: 0 is an optional slot.
    const ok = loadConfig(v2('{ section: Summary, minContains: 0 }'), dir)
    expect(runCorpus(ok, { cwd: join(dir, 'clean') }).exitCode).toBe(0)
    // ...and a v1 spelling inside the same inline contract gets the migrate hint.
    expect(() => loadConfig(v2('{ section: Summary, optional: true }'), dir)).toThrow(
      /'optional' is the v1 spelling/,
    )
  })

  it('rejects a code-authored contract ref', () => {
    const yaml = `mcVersion: 2
kind: config
rules:
  - include: ['*.md']
    contract: ./contracts/task.ts
`
    expect(() => loadConfig(yaml, dir)).toThrow(DeclarativeError)
  })

  it('rejects a contract document handed in as a config', () => {
    expect(() => loadConfig(CONTRACT, dir)).toThrow(DeclarativeError)
  })
})

const INLINE = 'contract: { body: { order: none, sections: [ { section: Summary } ] } }'

describe('loadConfig — malformed config is rejected with a clear DeclarativeError', () => {
  it('rules must be a list', () => {
    expect(() => loadConfig('mcVersion: 2\nkind: config\nrules: nope\n', dir)).toThrow(
      /config.rules must be a list/,
    )
  })

  it('a rule must be a mapping (not a bare scalar)', () => {
    expect(() =>
      loadConfig('mcVersion: 2\nkind: config\nrules:\n  - just-a-string\n', dir),
    ).toThrow(/a rule must be a mapping/)
  })

  it('include must be a non-empty list of strings', () => {
    const missing = 'mcVersion: 2\nkind: config\nrules:\n  - contract: doc\n'
    const empty = `mcVersion: 2\nkind: config\nrules:\n  - include: []\n    ${INLINE}\n`
    const nonString = `mcVersion: 2\nkind: config\nrules:\n  - include: [1]\n    ${INLINE}\n`
    for (const bad of [missing, empty, nonString]) {
      expect(() => loadConfig(bad, dir)).toThrow(/include must be a non-empty list of globs/)
    }
  })

  it('a rule-level exclude rides through when a list of strings, and is rejected otherwise', () => {
    const ok = `mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n    exclude: ['skip.md']\n    ${INLINE}\n`
    expect(loadConfig(ok, dir).rules[0]!.exclude).toEqual(['skip.md'])
    const notList = `mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n    exclude: nope\n    ${INLINE}\n`
    const badItem = `mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n    exclude: [1]\n    ${INLINE}\n`
    for (const bad of [notList, badItem]) {
      expect(() => loadConfig(bad, dir)).toThrow(/exclude must be a list of globs/)
    }
  })

  it('a rule needs a contract', () => {
    expect(() =>
      loadConfig("mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n", dir),
    ).toThrow(/a rule needs a contract/)
  })

  it('a contract ref that is neither a mapping, a name, nor a path is rejected', () => {
    const yaml = "mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n    contract: 5\n"
    expect(() => loadConfig(yaml, dir)).toThrow(
      /contract must be a name, a .yaml path, or an inline contract/,
    )
  })

  it('resolves an absolute .yaml contract path directly (no baseDir join)', () => {
    const abs = join(dir, 'doc.contract.yaml')
    const yaml = `mcVersion: 2\nkind: config\nrules:\n  - include: ['*.md']\n    contract: ${JSON.stringify(abs)}\n`
    expect(loadConfig(yaml, dir).rules).toHaveLength(1)
  })
})

describe('CLI — validate with a .yaml config', () => {
  it('a failing tree with --config x.yaml → exit 1', async () => {
    const res = await runCli(['validate', dir, '--config', join(dir, 'mc.yaml')], { cwd: dir })
    expect(res.code).toBe(1)
  })

  it('a clean subtree with --config x.yaml → exit 0', async () => {
    const res = await runCli(['validate', join(dir, 'clean'), '--config', join(dir, 'mc.yaml')], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })
})

describe('CLI — config-less --contract parameterization', () => {
  const contract = () => join(dir, 'doc.contract.yaml')

  it('one contract over a tree (failing tree → exit 1)', async () => {
    const res = await runCli(['validate', dir, '--contract', contract()], { cwd: dir })
    expect(res.code).toBe(1) // bad.md has no Summary section
  })

  it('one contract over a clean subtree → exit 0', async () => {
    const res = await runCli(['validate', join(dir, 'clean'), '--contract', contract()], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })

  it('inline contract/path pair routes by directory (clean subtree → exit 0)', async () => {
    const res = await runCli(['validate', '--contract', contract(), '--path', 'clean'], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })

  it('inline pair pointed at the failing tree → exit 1', async () => {
    const res = await runCli(['validate', '--contract', contract(), '--path', '.'], { cwd: dir })
    expect(res.code).toBe(1)
  })

  it('an absolute --path inside cwd routes like the relative one', async () => {
    const res = await runCli(['validate', '--contract', contract(), '--path', join(dir, 'clean')], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })

  it('a --path that does not exist → exit 2, not a silent pass', async () => {
    const res = await runCli(['validate', '--contract', contract(), '--path', 'no-such-dir'], {
      cwd: dir,
    })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('is not a folder')
  })

  it('a --path outside cwd → exit 2, not a silent pass', async () => {
    const res = await runCli(['validate', '--contract', contract(), '--path', '..'], {
      cwd: join(dir, 'clean'),
    })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('outside the current folder')
  })

  it('a file as the positional <path> → exit 2 with a usage message', async () => {
    const file = join(dir, 'bad.md')
    const res = await runCli(['validate', file, '--contract', contract()], { cwd: dir })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('must be a folder')
  })

  it.each([
    ['no-default.mjs', 'export const rules = []\n'],
    ['bad-default.mjs', "export default { rules: 'x' }\n"],
  ])('a .mjs config without a CorpusConfig default export (%s) → exit 2', async (name, src) => {
    writeFileSync(join(dir, name), src)
    const res = await runCli(['validate', dir, '--config', join(dir, name)], { cwd: dir })
    expect(res.code).toBe(2)
    expect(res.stderr).toMatch(/must `export default` a CorpusConfig/)
  })

  it('--contract and --config together → exit 2', async () => {
    const res = await runCli(
      ['validate', dir, '--contract', contract(), '--config', join(dir, 'mc.yaml')],
      { cwd: dir },
    )
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('either --contract or --config')
  })

  it('--path without --contract → exit 2', async () => {
    const res = await runCli(['validate', dir, '--path', 'clean'], { cwd: dir })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('--path requires a matching --contract')
  })

  it('contract/path count mismatch → exit 2', async () => {
    const res = await runCli(
      ['validate', '--contract', contract(), '--contract', contract(), '--path', 'clean'],
      { cwd: dir },
    )
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('matching --path')
  })

  it('positional <path> combined with pairs → exit 2', async () => {
    const res = await runCli(['validate', dir, '--contract', contract(), '--path', 'clean'], {
      cwd: dir,
    })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('positional')
  })

  it('a non-YAML --contract ref → exit 2', async () => {
    const res = await runCli(['validate', dir, '--contract', join(dir, 'contract.ts')], {
      cwd: dir,
    })
    expect(res.code).toBe(2)
    expect(res.stderr).toContain('.yaml')
  })
})

describe('runCorpus — global include/exclude pre-filter', () => {
  it('exclude skips matching files (the failing bad.md → exit 0)', () => {
    const config = loadConfigFile(join(dir, 'mc.yaml'))
    const r = runCorpus(config, { cwd: dir, exclude: ['bad.md'] })
    expect(r.exitCode).toBe(0)
  })

  it('include narrows to matching files, AND-ed with the rules (exit 0, nothing flagged)', () => {
    const config = loadConfigFile(join(dir, 'mc.yaml'))
    const r = runCorpus(config, { cwd: dir, include: ['good.md'] })
    expect(r.exitCode).toBe(0)
    expect(r.findings).toEqual([])
  })

  it('an include that matches nothing validates nothing (exit 0)', () => {
    const config = loadConfigFile(join(dir, 'mc.yaml'))
    const r = runCorpus(config, { cwd: dir, include: ['does/not/exist/**'] })
    expect(r.exitCode).toBe(0)
    expect(r.findings).toEqual([])
  })
})

describe('CLI — glob scoping (--glob / --include / --exclude), all modes', () => {
  const contract = () => join(dir, 'doc.contract.yaml')

  it('--glob narrows a --contract run to matching files (exit 0)', async () => {
    const res = await runCli(
      ['validate', dir, '--contract', contract(), '--glob', 'clean/**/*.md'],
      { cwd: dir },
    )
    expect(res.code).toBe(0) // bad.md is outside the include narrowing
  })

  it('--exclude drops the failing file from a --contract run (exit 0)', async () => {
    const res = await runCli(['validate', dir, '--contract', contract(), '--exclude', 'bad.md'], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })

  it('--include is the explicit form of --glob (exit 0)', async () => {
    const res = await runCli(['validate', dir, '--contract', contract(), '--include', 'good.md'], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })

  it('scoping applies to --config mode too (--exclude bad.md → exit 0)', async () => {
    const res = await runCli(
      ['validate', dir, '--config', join(dir, 'mc.yaml'), '--exclude', 'bad.md'],
      { cwd: dir },
    )
    expect(res.code).toBe(0)
  })

  it('a --glob matching nothing validates nothing → exit 0', async () => {
    const res = await runCli(['validate', dir, '--contract', contract(), '--glob', 'nope/**'], {
      cwd: dir,
    })
    expect(res.code).toBe(0)
  })
})
