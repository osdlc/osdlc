// Writes and checks data/: the compiled harness knowledge and its JSON Schema. Both are
// compiled from the corpus in this repository, packages/corpora/harness-reference.
//
//   node scripts/sync.ts                    compile the corpus at HEAD and copy the result
//                                           into data/. HEAD must be a commit of origin/main
//                                           and the corpus unchanged, since every basis link
//                                           names that commit.
//   node scripts/sync.ts --commit <sha>     compile the corpus as it was at <sha>, with basis
//                                           links at <sha>. Use it to rewrite data/ after a
//                                           change to the compiler alone.
//   node scripts/sync.ts --from <dir>       copy from a directory that holds the two files
//   node scripts/sync.ts --check            check data/ against the corpus. See check().
//
// Both files are checked to parse, and the data file to name schema 1, before data/ is touched.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export const FILES = ['harness-knowledge.json', 'harness-knowledge.schema.json'] as const
/** The repository and folder the corpus is in. */
export const REPO = 'osdlc/osdlc'
export const CORPUS_PATH = 'packages/corpora/harness-reference/corpus'
const DATA = resolve(import.meta.dirname, '../data')
const ROOT = resolve(import.meta.dirname, '../../../..')
const COMPILE = join(ROOT, 'packages/corpora/harness-reference/src/compile/compile.ts')

/** What is wrong with a directory of compiled files; empty when it can be copied. */
export function problems(dir: string): string[] {
  const out: string[] = []
  for (const file of FILES) {
    const path = join(dir, file)
    if (!existsSync(path)) {
      out.push(`${path} is missing`)
      continue
    }
    try {
      const json = JSON.parse(readFileSync(path, 'utf-8')) as { schema?: unknown }
      if (file === FILES[0] && json.schema !== 1) out.push(`${path}: "schema" is not 1`)
    } catch (e) {
      out.push(`${path} is not JSON: ${(e as Error).message}`)
    }
  }
  return out
}

/** Copies the two files from `dir` into data/. */
export function syncFrom(dir: string, dest: string = DATA): void {
  const bad = problems(dir)
  if (bad.length > 0) throw new Error(bad.join('\n'))
  for (const file of FILES) copyFileSync(join(dir, file), join(dest, file))
}

interface Compiled {
  corpus: { repo: string; path: string; commit: string }
  values: { harness: string; subject: string; basis: string }[]
}

/**
 * The compiled file as text with where it came from taken out: the `corpus` block, and the
 * repository, commit and corpus folder at the start of each `basis`. Two files with the same
 * result hold the same harnesses, subjects and values, from statements at the same paths.
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

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8' }).trim()

const tmp = (): string => mkdtempSync(join(tmpdir(), 'harness-knowledge-'))

/** Runs the corpus's compiler and returns the directory it wrote the two files to. */
function compileTo(out: string, args: string[]): string {
  execFileSync(process.execPath, [COMPILE, '--out', out, ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return out
}

/** Compiles the corpus as it was at `commit`, with basis links at `commit`. */
function compileAt(commit: string, out: string, work: string): string {
  const sha = git('rev-parse', '--verify', `${commit}^{commit}`)
  const tar = join(work, 'corpus.tar')
  mkdirSync(work, { recursive: true })
  git('archive', '--format=tar', '-o', tar, sha, CORPUS_PATH)
  execFileSync('tar', ['-xf', tar, '-C', work])
  return compileTo(out, ['--corpus', join(work, CORPUS_PATH), '--commit', sha])
}

/** Compiles the corpus at HEAD, which must be clean and a commit of origin/main. */
function compileHead(out: string): string {
  try {
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
  } catch {
    throw new Error(
      'HEAD is not a commit of origin/main, so basis links at it would not last. ' +
        'Run this on main after the corpus change has merged, or pass --commit <sha>.',
    )
  }
  return compileTo(out, ['--strict'])
}

/**
 * Checks data/ against the corpus. Returns the errors; prints a warning for what is only behind.
 *
 * - The schema file must be what the compiler writes now.
 * - When the data names a commit of this repository, it must be byte for byte what the compiler
 *   writes for the corpus at that commit. A corpus change made since is reported as a warning,
 *   not an error: data/ is rewritten after the change is on main, so it can name its commit.
 * - Data that names another repository (osdlc/skillwright, where the corpus was) cannot be
 *   compiled at its commit here. It must hold what the corpus at HEAD compiles to, apart from
 *   the links' repository, commit and folder.
 */
export function check(data: string = DATA): string[] {
  const work = tmp()
  try {
    const errors: string[] = []
    const committed = readFileSync(join(data, FILES[0]), 'utf-8')
    const { corpus } = JSON.parse(committed) as Compiled
    const head = compileTo(join(work, 'head'), ['--commit', 'HEAD'])
    if (readFileSync(join(head, FILES[1]), 'utf-8') !== readFileSync(join(data, FILES[1]), 'utf-8'))
      errors.push(`data/${FILES[1]} is not what the compiler writes`)
    const current =
      withoutSource(readFileSync(join(head, FILES[0]), 'utf-8')) === withoutSource(committed)
    if (corpus.repo !== REPO) {
      if (!current)
        errors.push(
          `data/${FILES[0]} names ${corpus.repo} and does not hold what the corpus here compiles to`,
        )
      return errors
    }
    const at = compileAt(corpus.commit, join(work, 'at'), join(work, 'tree'))
    if (readFileSync(join(at, FILES[0]), 'utf-8') !== committed)
      errors.push(
        `data/${FILES[0]} is not what the corpus at ${corpus.commit} compiles to; ` +
          `run sync --commit ${corpus.commit}`,
      )
    else if (!current)
      process.stdout.write(
        `::warning::data/${FILES[0]} is behind the corpus. Once the corpus change is on main, ` +
          'run `pnpm --filter @osdlc/harness-knowledge run sync` there and open a pull request.\n',
      )
    return errors
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      commit: { type: 'string' },
      check: { type: 'boolean' },
    },
  })
  const modes = [values.from, values.commit, values.check].filter((v) => v !== undefined)
  if (modes.length > 1) throw new Error('pass at most one of --from, --commit and --check')
  if (values.check === true) {
    const errors = check()
    if (errors.length > 0) throw new Error(errors.join('\n'))
    process.stdout.write('ok: data/ matches the corpus\n')
    return
  }
  if (values.from !== undefined) {
    syncFrom(resolve(values.from))
    return
  }
  const work = tmp()
  try {
    const out = join(work, 'out')
    syncFrom(
      values.commit === undefined
        ? compileHead(out)
        : compileAt(values.commit, out, join(work, 'tree')),
    )
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
