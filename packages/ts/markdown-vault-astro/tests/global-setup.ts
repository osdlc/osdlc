/**
 * Builds dist/ once before the suite: the CLI tests run the built `markdown-vault-astro` program
 * (`bin/markdown-vault-astro.js`), which loads `dist/cli.js`.
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
