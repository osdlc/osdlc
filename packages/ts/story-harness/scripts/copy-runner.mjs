// Copies the runner's shell script into dist/runner/ beside the compiled
// files, which the container copies as one flat folder. tsc emits only the
// TypeScript.
import { chmodSync, copyFileSync } from 'node:fs'

const from = new URL('../src/runner/story-shots.sh', import.meta.url)
const to = new URL('../dist/runner/story-shots.sh', import.meta.url)
copyFileSync(from, to)
chmodSync(to, 0o755)
