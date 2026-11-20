// Compiles the harness reference corpus (packages/corpora/harness-reference/corpus) into
// data/harness-knowledge.json, which is not committed. `build` runs it before tsc, so the
// JSON module src/data.ts imports exists.
//
// Every `basis` link names the commit the corpus is compiled at, HEAD. A build from a commit of
// origin/main gives links that last. Any other HEAD gives links to a commit that may never be
// published, and this prints a warning.
//
// data/harness-knowledge.schema.json is committed and reviewed by hand, so it is checked here
// against what the compiler writes, not overwritten.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DATA = resolve(import.meta.dirname, '../data')
const ROOT = resolve(import.meta.dirname, '../../../..')
const COMPILE = join(ROOT, 'packages/corpora/harness-reference/src/compile/compile.ts')
const DATA_FILE = 'harness-knowledge.json'
const SCHEMA_FILE = 'harness-knowledge.schema.json'

/** Whether HEAD is a commit of origin/main, so that basis links at it will last. */
function onMain(): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], {
      cwd: ROOT,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function main(): void {
  const out = mkdtempSync(join(tmpdir(), 'harness-knowledge-'))
  try {
    execFileSync(process.execPath, [COMPILE, '--out', out], {
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    if (
      readFileSync(join(out, SCHEMA_FILE), 'utf-8') !==
      readFileSync(join(DATA, SCHEMA_FILE), 'utf-8')
    )
      throw new Error(
        `data/${SCHEMA_FILE} is not what the compiler writes. Rewrite it with ` +
          '`node ../../corpora/harness-reference/src/compile/compile.ts --out data`.',
      )
    copyFileSync(join(out, DATA_FILE), join(DATA, DATA_FILE))
    if (!onMain())
      process.stderr.write(
        'warning: HEAD is not a commit of origin/main, so the basis links in ' +
          `data/${DATA_FILE} name a commit that may not be published.\n`,
      )
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

main()
