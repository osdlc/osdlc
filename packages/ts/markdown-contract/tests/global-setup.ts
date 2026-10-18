/**
 * Builds dist/ once before the suite, and the dist/ of the `gfm-table` workspace library, which the
 * built package imports by name. The CLI tests run the built `markdown-contract` program,
 * the corpus config they load imports the package by name (which resolves to dist/), and
 * `tests/core-entry.test.ts` reads the built import graph of `./core`.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  for (const dir of ['..', '../../gfm-table']) {
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
      cwd: fileURLToPath(new URL(dir, import.meta.url)),
      stdio: 'inherit',
    })
  }
}
