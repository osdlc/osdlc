/**
 * Every recipe in the README, run as written (D-4CE9): each `$ repo-cleaner`
 * line in its Recipes section, one fresh repository per code block, the
 * commands of a block in order. A recipe whose command stops parsing, or
 * starts failing, fails here. A few recipes also have their outcome checked.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import { captureContext } from '@osdlc/cli-tool'

import { cannedGh, sh, withRemotes, type Remotes } from './helpers.ts'
import { main, type MainDeps } from '../src/cli.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const README = readFileSync(join(HERE, '..', 'README.md'), 'utf8')

/** The README's Recipes section, as code blocks of `$ repo-cleaner` commands. */
function recipeBlocks(): string[][] {
  const start = README.indexOf('\n## Recipes')
  const section = README.slice(start, README.indexOf('\n## ', start + 1))
  const blocks = [...section.matchAll(/```console\n([\s\S]*?)```/g)].map((m) =>
    [...m[1]!.matchAll(/^\$ repo-cleaner(.*)$/gm)].map((c) => c[1]!.trim()),
  )
  return blocks.filter((b) => b.length > 0)
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

/** Merge `branch` into `main` and push `main` to each of `remotes`. */
function land(fx: Remotes, branch: string, ...remotes: string[]): void {
  sh(fx.root, ['merge', '-q', '--no-ff', '-m', `Merge ${branch}`, branch])
  for (const remote of remotes) sh(fx.root, ['push', '-q', remote, 'main'])
}

/**
 * A fork (`origin`, me/app) and its parent (`upstream`, acme/app), with the
 * branches the recipes name: feat/login, release/1 and staging landed
 * everywhere, feat/spike unlanded, feat/up landed upstream only, and
 * feat/theirs on upstream, landed there.
 */
function recipeRepo(): Remotes {
  const fx = withRemotes('rc-recipe', {
    origin: { github: 'me/app' },
    upstream: { github: 'acme/app' },
  })
  cleanups.push(fx.cleanup)
  for (const b of ['feat/login', 'release/1', 'staging', 'feat/spike', 'feat/up']) {
    fx.pushBranch('origin', b)
  }
  fx.pushBranch('upstream', 'feat/theirs')
  for (const b of ['feat/login', 'release/1', 'staging', 'feat/theirs']) {
    land(fx, b, 'origin', 'upstream')
  }
  land(fx, 'feat/up', 'upstream')
  sh(fx.root, ['reset', '-q', '--hard', 'origin/main'])
  return fx
}

/** `line` as argv: words, with the single quotes a shell would take away. */
const argvOf = (line: string, fx: Remotes): string[] =>
  line
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((w) => w.replace(/'/g, ''))
    .map((w) =>
      w === '~/Developer'
        ? dirname(fx.root)
        : w === 'https://github.com/acme/app.git'
          ? `file://${fx.bare['upstream']}`
          : w,
    )

function run(fx: Remotes, argv: string[], deps: MainDeps = {}) {
  const ctx = captureContext({
    cwd: fx.root,
    env: { ...process.env, REPO_CLEANER_CACHE_DIR: join(dirname(fx.root), 'cache') },
  })
  const code = main(argv, ctx, {
    confirm: () => true,
    checklist: (_q, items) => items.flatMap((item, i) => (item.checked === true ? [i] : [])),
    runners: {
      git: fx.git,
      gh: cannedGh([], {
        forks: { 'me/app': 'acme/app' },
        byRepo: { 'me/app': [], 'acme/app': [] },
      }),
    },
    ...deps,
  })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

const heads = (dir: string): string =>
  sh(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])

describe('every README recipe runs as written', () => {
  const blocks = recipeBlocks()

  test('the README has the recipes', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(18)
  })

  for (const block of blocks) {
    test(
      block.map((c) => `repo-cleaner ${c}`.trim()).join(' && '),
      () => {
        const fx = recipeRepo()
        for (const line of block) {
          // `--branch HEAD` is the branch checked out here: be on one.
          if (line.includes('--branch HEAD')) sh(fx.root, ['checkout', '-q', 'staging'])
          const res = run(fx, argvOf(line, fx))
          // The bare command explains the phases and exits 2; every other runs.
          expect({ line, code: res.code, err: res.err }).toEqual({
            line,
            code: line === '' ? 2 : 0,
            err: expect.any(String),
          })
        }
      },
      60_000,
    )
  }
})

describe('what the recipes do', () => {
  test('clean -y deletes the landed local branches and nothing else', () => {
    const fx = recipeRepo()
    expect(run(fx, ['clean', '-y']).code).toBe(0)
    const left = heads(fx.root)
    expect(left).not.toContain('feat/login')
    expect(left).toContain('feat/spike')
    expect(heads(fx.bare['origin']!)).toContain('feat/login')
  })

  test('--remote=upstream cleans upstream only', () => {
    const fx = recipeRepo()
    expect(run(fx, ['clean', '--remote=upstream', '-y']).code).toBe(0)
    expect(heads(fx.bare['upstream']!)).not.toContain('feat/theirs')
    expect(heads(fx.bare['origin']!)).toContain('feat/login')
  })

  test("--against upstream cleans the fork's branches that landed upstream", () => {
    const fx = recipeRepo()
    expect(run(fx, ['clean', '--remote', '-y']).code).toBe(0)
    expect(heads(fx.bare['origin']!)).toContain('feat/up')
    expect(run(fx, ['clean', '--remote', '--against', 'upstream', '-y']).code).toBe(0)
    expect(heads(fx.bare['origin']!)).not.toContain('feat/up')
    expect(heads(fx.bare['origin']!)).toContain('main')
  })

  test('--pick with --allow deletes an unlanded branch', () => {
    const fx = recipeRepo()
    expect(run(fx, ['clean', '--pick', 'feat/spike', '-y']).code).toBe(0)
    expect(heads(fx.root)).toContain('feat/spike')
    expect(
      run(fx, ['clean', '--pick', 'feat/spike', '--allow', 'abandon-unmerged', '-y']).code,
    ).toBe(0)
    expect(heads(fx.root)).not.toContain('feat/spike')
  })

  test('--spare keeps what it names, by glob or by name', () => {
    const fx = recipeRepo()
    const argv = ['clean', '--all', '--spare', 'release/*', '--spare', 'staging', '-y']
    expect(run(fx, argv).code).toBe(0)
    for (const dir of [fx.root, fx.bare['origin']!]) {
      expect(heads(dir)).toContain('release/1')
      expect(heads(dir)).toContain('staging')
      expect(heads(dir)).not.toContain('feat/login')
    }
  })
})
