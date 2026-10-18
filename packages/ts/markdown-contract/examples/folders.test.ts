/**
 * Checking a folder: the runner with a config in code, YAML contracts and configs, config
 * inference, and the command as a function.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  contract,
  defineConfig,
  lenientBody,
  runCorpus,
  section,
  type CorpusConfig,
  type RunStats,
} from '@osdlc/markdown-contract'
import { runCli, type CliResult } from '@osdlc/markdown-contract/cli'
import {
  DeclarativeError,
  compileContractObject,
  inferConfig,
  loadConfig,
  loadConfigFile,
  loadContract,
  loadContractFile,
  type InferOptions,
  type InferResult,
  type InferredContract,
  type InferredFile,
} from '@osdlc/markdown-contract/declarative'

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'markdown-contract-example-'))
  mkdirSync(join(dir, 'decisions'))
  writeFileSync(
    join(dir, 'decisions', 'a.md'),
    '---\nstatus: accepted\n---\n\n## Context\n\nx\n\n## Decision\n\ny\n',
  )
  writeFileSync(join(dir, 'decisions', 'b.md'), '---\nstatus: open\n---\n\n## Context\n\nx\n')
  writeFileSync(join(dir, 'README.md'), '# Notes\n')
})

describe('runCorpus', () => {
  test('a config maps globs to contracts; the run returns findings and counts', () => {
    const config: CorpusConfig = defineConfig({
      rules: [
        {
          name: 'decisions',
          include: ['decisions/*.md'],
          contract: contract({
            frontmatter: z.object({ status: z.enum(['open', 'accepted']) }),
            body: lenientBody([section('Context'), section('Decision')]),
          }),
        },
      ],
    })

    const { findings, exitCode, stats } = runCorpus(config, { cwd: dir })
    const counts: RunStats = stats

    expect(findings.map((f) => [f.path, f.id])).toEqual([
      ['decisions/b.md', 'structure/section-missing'],
    ])
    expect(exitCode).toBe(1)
    expect([counts.filesScanned, counts.filesMatched, counts.filesUnmatched]).toEqual([3, 2, 1])
  })
})

describe('YAML contracts and configs', () => {
  const contractYaml = `mcVersion: 2
kind: contract
frontmatter:
  type: object
  required: [status]
  properties:
    status: { enum: [open, accepted] }
body:
  sections:
    - section: Context
    - section: Decision
`

  test('a YAML contract compiles to the same Contract as code', () => {
    const decision = loadContract(contractYaml)
    const findings = decision.validate('---\nstatus: open\n---\n\n## Context\n\nx\n', {
      path: 'b.md',
    }).findings
    expect(findings.map((f) => f.id)).toEqual(['structure/section-missing'])

    const inline = compileContractObject({ body: { sections: [{ section: 'Context' }] } })
    expect(inline.validate('## Context\n\nx\n', { path: 'c.md' }).findings).toEqual([])
  })

  test('a YAML config maps globs to contract files', () => {
    writeFileSync(join(dir, 'decision.contract.yaml'), contractYaml)
    const configYaml = `mcVersion: 2
kind: config
rules:
  - include: ['decisions/*.md']
    contract: ./decision.contract.yaml
`
    writeFileSync(join(dir, 'markdown-contract.yaml'), configYaml)

    expect(
      loadContractFile(join(dir, 'decision.contract.yaml')).validate('## Context\n', {
        path: 'x.md',
      }).findings,
    ).toHaveLength(2)
    expect(loadConfig(configYaml, dir).rules).toHaveLength(1)
    expect(
      runCorpus(loadConfigFile(join(dir, 'markdown-contract.yaml')), { cwd: dir }).exitCode,
    ).toBe(1)
  })

  test('a malformed contract throws DeclarativeError, naming the key', () => {
    expect(() => loadContract('mcVersion: 2\nkind: contract\nbody:\n  sectons: []\n')).toThrow(
      DeclarativeError,
    )
    expect(() => loadContract('mcVersion: 1\nkind: contract\n')).toThrow(
      /markdown-contract migrate/,
    )
  })
})

describe('inferConfig (experimental)', () => {
  test('infers the tightest contract that accepts every file', () => {
    const options: InferOptions = { include: ['decisions/*.md'] }
    const result: InferResult = inferConfig(dir, options)
    const inferred: InferredContract = result.contracts[0]!
    const file: InferredFile = result.files[0]!

    expect(result.mode).toBe('single')
    expect(inferred.def).toMatchObject({
      body: { sections: [{ section: 'Context' }, { section: 'Decision', minContains: 0 }] },
    })
    expect(file.content).toContain('mcVersion: 2')
  })
})

describe('runCli (experimental)', () => {
  test('runs the command and returns what it would print', async () => {
    const result: CliResult = await runCli(['validate', '.', '--format', 'json'], { cwd: dir })
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)[0].id).toBe('structure/section-missing')
  })

  test('migrate rewrites a version 1 contract as version 2', async () => {
    writeFileSync(
      join(dir, 'old.contract.yaml'),
      'mcVersion: 1\nkind: contract\nbody:\n  sections:\n    - Context\n',
    )
    const result = await runCli(['migrate', 'old.contract.yaml', '--write'], { cwd: dir })
    expect(result.code).toBe(0)
    expect(readFileSync(join(dir, 'old.contract.yaml'), 'utf8')).toContain('mcVersion: 2')
  })
})
