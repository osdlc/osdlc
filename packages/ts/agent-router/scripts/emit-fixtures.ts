// Emit (or check) the fixture vectors shared with the Rust mirror; see fixtures.ts.
//
//   node scripts/emit-fixtures.ts           write fixtures/ from the TypeScript behaviour
//   node scripts/emit-fixtures.ts --check   exit 1 when fixtures/ differs from what is emitted
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emit } from './fixtures.ts'

export const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures')

/** Every .json file under `root`, as a path relative to `root`. */
function committedFiles(root: string, dir = root): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? committedFiles(root, join(dir, e.name))
      : e.name.endsWith('.json')
        ? [relative(root, join(dir, e.name))]
        : [],
  )
}

/** Differences between the emitted files and the committed ones: changed, missing and stale paths. */
export function drift(emitted: Map<string, string>, dir = FIXTURES_DIR): string[] {
  const problems: string[] = []
  for (const [path, text] of emitted) {
    const file = join(dir, path)
    if (!existsSync(file)) problems.push(`missing: ${path}`)
    else if (readFileSync(file, 'utf8') !== text) problems.push(`changed: ${path}`)
  }
  for (const path of committedFiles(dir)) {
    if (!emitted.has(path)) problems.push(`stale: ${path} is not emitted any more`)
  }
  return problems
}

/** Write the emitted files and delete committed .json files that are no longer emitted. */
export function write(emitted: Map<string, string>, dir = FIXTURES_DIR): void {
  for (const [path, text] of emitted) {
    const file = join(dir, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  for (const path of committedFiles(dir)) {
    if (!emitted.has(path)) rmSync(join(dir, path))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const emitted = emit()
  if (process.argv.includes('--check')) {
    const problems = drift(emitted)
    if (problems.length > 0) {
      process.stderr.write(
        `agent-router fixtures differ from what the TypeScript emits:\n${problems.map((p) => `  ${p}`).join('\n')}\nRun \`pnpm run fixtures\` in packages/ts/agent-router and commit the result.\n`,
      )
      process.exit(1)
    }
    process.stdout.write(`fixtures up to date (${emitted.size} files)\n`)
  } else {
    write(emitted)
    process.stdout.write(
      `wrote ${emitted.size} fixture files under ${relative(process.cwd(), FIXTURES_DIR)}\n`,
    )
  }
}
