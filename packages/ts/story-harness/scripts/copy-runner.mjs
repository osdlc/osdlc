// Copies the runner's shell scripts into dist/runner/ beside the compiled
// files, which the container copies as one flat folder. tsc emits only the
// TypeScript.
import { chmodSync, copyFileSync } from 'node:fs'

for (const name of ['story-shots.sh', 'platform.sh']) {
  const to = new URL(`../dist/runner/${name}`, import.meta.url)
  copyFileSync(new URL(`../src/runner/${name}`, import.meta.url), to)
  chmodSync(to, 0o755)
}
