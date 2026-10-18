/**
 * Builds dist/ once before the suite. The CLI tests run the built `markdown-contract` program,
 * the corpus config they load imports the package by name (which resolves to dist/), and
 * `tests/core-entry.test.ts` reads the built import graph of `./core`.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  })
}
