/**
 * `compile`: read the beta corpus and write `harness-knowledge.json`, the one file tools look
 * values up in, and `harness-knowledge.schema.json`, its JSON Schema. Only `current` and
 * `disputed` statements that support their proposition go in; open and neutral statements are
 * not values. Each value carries a permalink to its statement at the corpus
 * commit. Evidence, study results and documents stay in the corpus.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { type Beta, BETA, loadBeta } from '../beta/corpus.ts'
import { lint } from '../beta/lint.ts'
import { compareScopes, type Versioning } from '../beta/versions.ts'
import { KNOWLEDGE_SCHEMA, type Knowledge, type KnowledgeValue, type Scope } from './knowledge.ts'

export const REPO = 'osdlc/skillwright'
export const CORPUS_PATH = 'harness-reference/corpora/beta'
const ROOT = resolve(import.meta.dirname, '../..')

/** The URL of a corpus file at `commit`, which never moves. */
export const permalink = (commit: string, file: string): string =>
  `https://github.com/${REPO}/blob/${commit}/${CORPUS_PATH}/${file.split('/').map(encodeURIComponent).join('/')}`

export function compile(beta: Beta, commit: string): Knowledge {
  const problems = [...beta.report.errors, ...lint(beta)]
  if (problems.length > 0) throw new Error(`the corpus does not pass lint:\n${problems.join('\n')}`)

  const harnesses: Knowledge['harnesses'] = {}
  const slugOf = new Map<string, string>()
  for (const { ref, data } of beta.all('harnesses')) {
    const slug = String(data['slug'])
    slugOf.set(ref.file, slug)
    harnesses[slug] = {
      title: ref.id,
      versioning: data['versioning'] as Versioning,
      ...(typeof data['cli'] === 'string' ? { cli: data['cli'] } : {}),
    }
  }
  const subjects: Knowledge['subjects'] = {}
  const subjectSlug = new Map<string, string>()
  for (const { ref, data } of beta.all('subjects')) {
    const slug = String(data['slug'])
    subjectSlug.set(ref.file, slug)
    subjects[slug] = {
      title: ref.id,
      category: String(data['category']),
      ...(data['model_dependent'] === true ? { modelDependent: true as const } : {}),
      valueSchema: data['valueSchema'] as Record<string, unknown>,
    }
  }

  const values: KnowledgeValue[] = []
  for (const { ref, data } of beta.all('statements')) {
    const status = data['status']
    if (status !== 'current' && status !== 'disputed') continue
    if (data['direction'] !== 'supports') continue
    const harness = slugOf.get(beta.resolve(ref.file, data['harness'])?.file ?? '') as string
    const subject = subjectSlug.get(beta.resolve(ref.file, data['subject'])?.file ?? '') as string
    const scope = data['scope'] as Scope
    values.push({
      harness,
      subject,
      value: (data['proposition'] as { object: unknown }).object,
      scope: {
        since: scope.since,
        until: scope.until,
        platform: scope.platform,
        model: scope.model,
      },
      strength: data['strength'] as KnowledgeValue['strength'],
      basis: permalink(commit, ref.file),
      ...(status === 'disputed' ? { disputed: true as const } : {}),
    })
  }
  const order = (a: KnowledgeValue, b: KnowledgeValue): number => {
    if (a.harness !== b.harness) return a.harness < b.harness ? -1 : 1
    if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1
    const v = harnesses[a.harness]?.versioning ?? 'unknown'
    return (
      compareScopes(a.scope, b.scope, v) || (a.basis < b.basis ? -1 : a.basis > b.basis ? 1 : 0)
    )
  }
  values.sort(order)
  const sorted = <T>(o: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  return {
    schema: 1,
    corpus: { repo: REPO, path: CORPUS_PATH, commit },
    harnesses: sorted(harnesses),
    subjects: sorted(subjects),
    values,
  }
}

/** Write both files under `outDir`. */
export function writeKnowledge(outDir: string, knowledge: Knowledge): string[] {
  mkdirSync(outDir, { recursive: true })
  const files: [string, unknown][] = [
    ['harness-knowledge.json', knowledge],
    ['harness-knowledge.schema.json', KNOWLEDGE_SCHEMA],
  ]
  return files.map(([name, data]) => {
    const file = join(outDir, name)
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
    return file
  })
}

/**
 * The corpus files git sees as changed or untracked under `corpus`, or none when git cannot say.
 * Permalinks point at a commit, so values from a dirty tree link to text that is not there.
 */
export function dirtyFiles(corpus: string): string[] {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', '.'], {
      cwd: corpus,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((l) => l !== '')
  } catch {
    return []
  }
}

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      commit: { type: 'string' },
      out: { type: 'string' },
      corpus: { type: 'string' },
      strict: { type: 'boolean' },
    },
  })
  const corpus = values.corpus === undefined ? BETA : resolve(values.corpus)
  const commit =
    values.commit ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const dirty = values.commit === undefined ? dirtyFiles(corpus) : []
  if (dirty.length > 0) {
    const what = `the corpus has uncommitted changes, so permalinks at ${commit} will not match:\n${dirty.join('\n')}`
    if (values.strict === true) {
      console.error(`compile: ${what}`)
      return 1
    }
    console.error(`warning: ${what}`)
  }
  try {
    const knowledge = compile(loadBeta(corpus), commit)
    for (const f of writeKnowledge(resolve(values.out ?? join(ROOT, 'dist')), knowledge))
      console.log(`wrote ${f}`)
    console.log(`${knowledge.values.length} values at ${commit}`)
    return 0
  } catch (e) {
    console.error(`compile: ${(e as Error).message}`)
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
