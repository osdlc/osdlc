#!/usr/bin/env node
// The `story-shots` command, in four modes: the screenshot baseline check, the
// baseline update (`--update`), the accessibility check (`--a11y`) and the
// keyboard walk (`--walk`). It runs the package's runner script,
// dist/runner/story-shots.sh, with bash, passing every argument through.
// Requires the built dist/ (`pnpm run build`).
//
// stdio is inherited: the script streams Docker's and Playwright's output
// live, so this is a plain spawn and not a captured run.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../dist/runner/story-shots.sh', import.meta.url))
const result = spawnSync('bash', [script, ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) {
  console.error(`story-shots: could not run bash: ${result.error.message}`)
  process.exit(127)
}
process.exit(result.status ?? 1)
