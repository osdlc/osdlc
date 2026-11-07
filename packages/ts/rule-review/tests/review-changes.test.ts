import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentResult } from '@osdlc/agent-call'
import { afterEach, describe, expect, test } from 'vitest'

import { main } from '../src/cli.ts'
import { ChangesetError, reviewChanges } from '../src/review-changes.ts'
import type { Dispatch } from '../src/run.ts'
import { captureOutput } from './capture-output.ts'
import { makeRepo, writeFile } from './fixture-repo.ts'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function repo(files: Record<string, string>): string {
  const { root } = makeRepo(files)
  roots.push(root)
  return root
}

const clean: Dispatch = async () =>
  ({ ok: true, exitCode: 0, durationMs: 1, structured: { findings: [] } }) as AgentResult

describe('reviewChanges', () => {
  test('reads the changeset, the rule sources and the diffs from the checkout', async () => {
    const root = repo({
      'CLAUDE.md': 'Repo rules.\n',
      'src/CLAUDE.md': 'Src rules.\n',
      'a.md': 'a\n',
    })
    writeFile(root, 'src/x.ts', 'export const x = 1\n')
    const prompts: string[] = []
    const dispatch: Dispatch = async (spec, config, signal) => {
      prompts.push(spec.prompt)
      return clean(spec, config, signal)
    }

    const run = await reviewChanges({ cwd: join(root, 'src'), dispatch })

    expect(run.projectRoot).toBe(root)
    expect(run.base).toBe('HEAD')
    expect(run.changedFiles).toEqual(['src/x.ts'])
    expect(run.jobs.map((j) => j.source.id)).toEqual([
      'instruction:CLAUDE.md',
      'instruction:src/CLAUDE.md',
    ])
    expect(prompts.every((p) => p.includes('+export const x = 1'))).toBe(true)
    expect(run.findings).toEqual([])
    expect(run.config.engine).toBe('claude')
  })

  test('starts no agent when nothing changed', async () => {
    const root = repo({ 'CLAUDE.md': 'Rules.\n' })
    const run = await reviewChanges({
      cwd: root,
      dispatch: () => Promise.reject(new Error('no agent should start')),
    })

    expect(run.changedFiles).toEqual([])
    expect(run.jobs).toEqual([])
  })

  test('merges config over the defaults', async () => {
    const root = repo({ 'CLAUDE.md': 'Rules.\n' })
    const run = await reviewChanges({ cwd: root, config: { blocking: true }, dryRun: true })

    expect(run.config.blocking).toBe(true)
    expect(run.config.maxFilesPerJob).toBe(12)
  })

  test('refuses a directory outside a git checkout', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rule-review-outside-'))
    roots.push(outside)
    const err = await reviewChanges({ cwd: outside }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ChangesetError)
    expect((err as ChangesetError).kind).toBe('not-a-repository')
  })

  test('refuses a base that does not resolve', async () => {
    const root = repo({ 'CLAUDE.md': 'Rules.\n' })
    const err = await reviewChanges({ cwd: root, base: 'no-such-branch' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ChangesetError)
    expect((err as ChangesetError).kind).toBe('bad-base')
  })
})

describe('rule-review --strict and --engine', () => {
  /** A repo with one change under a CLAUDE.md, and a `claude` on PATH that fails at once. */
  async function withFailingAgent(argv: string[]) {
    const root = repo({ 'CLAUDE.md': 'Rules.\n', 'a.ts': 'a\n' })
    writeFile(root, 'a.ts', 'a2\n')
    const bin = mkdtempSync(join(tmpdir(), 'rule-review-failing-agent-'))
    roots.push(bin)
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "no credentials" >&2\nexit 1\n')
    chmodSync(join(bin, 'claude'), 0o755)
    const path = process.env['PATH']
    process.env['PATH'] = `${bin}:${path ?? ''}`
    try {
      return await captureOutput(() => main(['-C', root, ...argv]))
    } finally {
      process.env['PATH'] = path
    }
  }

  test('an incomplete run exits 0 by default and 2 with --strict', async () => {
    const lenient = await withFailingAgent(['--blocking'])
    expect(lenient.code).toBe(0)
    expect(lenient.err).toContain('the run was incomplete')

    const strict = await withFailingAgent(['--blocking', '--strict'])
    expect(strict.code).toBe(2)
  })

  test('--json carries degraded, and --strict sets the exit code from it', async () => {
    const { code, out } = await withFailingAgent(['--json', '--strict'])
    const run = JSON.parse(out) as { degraded: boolean; changedFiles: string[] }

    expect(run.degraded).toBe(true)
    expect(run.changedFiles).toEqual(['a.ts'])
    expect(code).toBe(2)
  })

  test('an unknown --engine is a usage error', async () => {
    const { code, err } = await captureOutput(() => main(['--engine', 'gpt']))

    expect(code).toBe(2)
    expect(err).toContain('--engine expects one of claude')
  })
})
