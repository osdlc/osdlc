// Copies a plan file (tasks.json) to data/plan.json.
// Usage: node scripts/sync-plan.mjs [path]. A given path is read from the current folder; the
// default is the repo's docs/diagrams/tasks.json. The app checks the plan's rules when it loads it.
import { copyFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const explorer = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = process.argv[2] ? resolve(process.argv[2]) : resolve(explorer, '../../docs/diagrams/tasks.json')
const to = resolve(explorer, 'data/plan.json')

let plan
try {
  plan = JSON.parse(readFileSync(from, 'utf8'))
} catch (cause) {
  console.error(`Cannot read ${from} as JSON: ${cause instanceof Error ? cause.message : cause}`)
  process.exit(1)
}
if (!Array.isArray(plan?.milestones) || !Array.isArray(plan?.tasks)) {
  console.error(`${from} has no milestones and tasks arrays, so it is not a plan file.`)
  process.exit(1)
}

copyFileSync(from, to)
console.log(`Copied ${plan.tasks.length} tasks in ${plan.milestones.length} milestones from ${from} to ${to}.`)
