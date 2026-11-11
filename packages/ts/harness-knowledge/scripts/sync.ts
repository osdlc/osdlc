// Copies the compiled harness knowledge into data/.
//
//   node scripts/sync.ts --from <dir>       a directory holding harness-knowledge.json
//                                           and harness-knowledge.schema.json (the output
//                                           of `pnpm --filter harness-reference run compile`
//                                           in osdlc/skillwright)
//   node scripts/sync.ts --release <tag>    download those two assets from the
//                                           osdlc/skillwright release <tag> with `gh`
//
// Both files are checked to parse, and the data file to name schema 1, before data/ is touched.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export const FILES = ['harness-knowledge.json', 'harness-knowledge.schema.json'] as const
export const REPO = 'osdlc/skillwright'
const DATA = resolve(import.meta.dirname, '../data')

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

function main(): void {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, release: { type: 'string' } },
  })
  if ((values.from === undefined) === (values.release === undefined)) {
    throw new Error('pass exactly one of --from <dir> and --release <tag>')
  }
  if (values.from !== undefined) {
    syncFrom(resolve(values.from))
    return
  }
  const tmp = mkdtempSync(join(tmpdir(), 'harness-knowledge-'))
  try {
    execFileSync(
      'gh',
      [
        'release',
        'download',
        values.release!,
        '--repo',
        REPO,
        ...FILES.flatMap((f) => ['--pattern', f]),
        '--dir',
        tmp,
      ],
      { stdio: 'inherit' },
    )
    syncFrom(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
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
