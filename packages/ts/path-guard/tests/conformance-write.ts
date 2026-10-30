/**
 * Writes the expected values of the path-guard conformance suite.
 *
 *   pnpm --filter @osdlc/path-guard conformance:write
 *
 * Inputs are written by hand in `packages/conformance/path-guard/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`. Run it on Linux or
 * macOS. A case for `windows` only is written by a second run of this script,
 * with `--windows`, that loads the package as on Windows: the guard reads the
 * platform once, when it loads, so it cannot answer for both in one process.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const WINDOWS_RUN = process.argv.includes('--windows')
if (WINDOWS_RUN) Object.defineProperty(process, 'platform', { value: 'win32' })

const { HOST, SUITE_PATH, readSuite, run } = await import('./conformance.ts')
type Case = import('./conformance.ts').Case
type Outcome = import('./conformance.ts').Outcome

/** The host a case is written on: this one, unless the case runs on `windows` only. */
const writtenOn = (c: Case) => (c.platforms?.includes('unix') === false ? 'windows' : 'unix')

const suite = readSuite()

if (WINDOWS_RUN) {
  // Answers each `windows`-only case, in suite order, as JSON on stdout.
  const out: Outcome[] = []
  for (const [name, section] of Object.entries(suite.sections)) {
    for (const c of section.cases) if (writtenOn(c) === 'windows') out.push(run(name, c.input))
  }
  process.stdout.write(JSON.stringify(out))
} else {
  if (HOST !== 'unix') throw new Error('run the generator on Linux or macOS')
  const windows = JSON.parse(
    execFileSync(process.execPath, [import.meta.filename, '--windows'], { encoding: 'utf8' }),
  ) as Outcome[]
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
    version: string
  }
  suite.referenceVersion = pkg.version
  for (const [name, section] of Object.entries(suite.sections)) {
    section.cases = section.cases.map((c): Case => {
      const got = writtenOn(c) === 'windows' ? windows.shift() : run(name, c.input)
      if (got === undefined) throw new Error('the --windows run answered too few cases')
      return {
        name: c.name,
        input: c.input,
        ...got,
        ...(c.platforms === undefined ? {} : { platforms: c.platforms }),
        ...(c.skip === undefined ? {} : { skip: c.skip }),
      }
    })
  }
  if (windows.length > 0) throw new Error('the --windows run answered too many cases')
  writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
}
