// Fails when the compiled data differs from the last published version's and no changeset
// names this package. The data is built, not committed, so a change to the corpus reaches
// consumers only if a release is cut; a changeset is what cuts it.
//
//   node scripts/check-release.ts
//
// "Differs" ignores where the data came from: the commit, and the start of every basis link. Two
// files that agree there hold the same harnesses, subjects and values, from statements at the
// same paths. It passes when the package is not on npm yet, and when package.json is ahead of
// npm, because a release is already on its way.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PACKAGE = resolve(import.meta.dirname, '..')
const CHANGESETS = resolve(PACKAGE, '../../../.changeset')
const DATA_FILE = 'harness-knowledge.json'

interface Compiled {
  corpus: { repo: string; commit: string; path: string }
  values: { basis: string }[]
}

/**
 * The compiled file as text with where it came from taken out: the `corpus` block, and the
 * repository, commit and corpus folder at the start of each `basis`.
 */
export function withoutSource(text: string): string {
  const k = JSON.parse(text) as Compiled
  const prefix = `https://github.com/${k.corpus.repo}/blob/${k.corpus.commit}/${k.corpus.path}/`
  const values = k.values.map((v) => {
    if (!v.basis.startsWith(prefix)) throw new Error(`basis is outside the corpus: ${v.basis}`)
    return { ...v, basis: v.basis.slice(prefix.length) }
  })
  return JSON.stringify({ ...k, corpus: null, values }, null, 2)
}

/** Whether a changeset file's front matter names `name`. */
export function namesPackage(changeset: string, name: string): boolean {
  const front = /^---\n([\s\S]*?)\n---/.exec(changeset)?.[1] ?? ''
  return front.split('\n').some((l) => l.replace(/["']/g, '').trim().startsWith(`${name}:`))
}

const run = (cmd: string, args: string[], cwd?: string): string =>
  execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()

function main(): void {
  const pkg = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf-8')) as {
    name: string
    version: string
  }
  let published: string
  try {
    published = run('npm', ['view', pkg.name, 'version'])
  } catch {
    process.stdout.write(`ok: ${pkg.name} is not on npm yet\n`)
    return
  }
  if (published !== pkg.version) {
    process.stdout.write(`ok: ${pkg.version} is not ${published} yet, so a release is pending\n`)
    return
  }
  const work = mkdtempSync(join(tmpdir(), 'hk-release-'))
  try {
    const tarball = run('npm', ['pack', `${pkg.name}@${published}`, '--silent'], work)
    run('tar', ['-xf', tarball], work)
    const before = readFileSync(join(work, 'package/data', DATA_FILE), 'utf-8')
    const now = readFileSync(join(PACKAGE, 'data', DATA_FILE), 'utf-8')
    if (withoutSource(before) === withoutSource(now)) {
      process.stdout.write(`ok: the data is what ${pkg.name}@${published} ships\n`)
      return
    }
    const named = readdirSync(CHANGESETS)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .some((f) => namesPackage(readFileSync(join(CHANGESETS, f), 'utf-8'), pkg.name))
    if (!named)
      throw new Error(
        `the compiled data differs from ${pkg.name}@${published} and no changeset names ` +
          `${pkg.name}. Add one to .changeset/ so the corpus change is released.`,
      )
    process.stdout.write('ok: the data changed, and a changeset names the package\n')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`)
    process.exitCode = 1
  }
}
