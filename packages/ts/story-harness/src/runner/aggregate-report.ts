/**
 * Collects the per-story files of one e2e run into one report and prints a
 * summary.
 *
 *     node aggregate-report.js <a11y | walk> <test-results dir>
 *
 * `a11y` reads `<dir>/a11y/*.json` into `<dir>/a11y-report.json`; `walk` reads
 * `<dir>/walk/<story>/walk.json` into `<dir>/walk-report.json`. Run by
 * `story-shots.sh` inside the container, so it imports node built-ins only.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WalkRecord } from './walk.ts'

interface A11yRecord {
  id: string
  theme: string
  violations: Array<{ id: string }>
}

const [mode, results] = process.argv.slice(2)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

if (!results || (mode !== 'a11y' && mode !== 'walk')) {
  console.error('usage: aggregate-report.js <a11y | walk> <test-results dir>')
  process.exit(2)
}

if (mode === 'a11y') {
  const dir = join(results, 'a11y')
  const files = existsSync(dir) ? readdirSync(dir).sort() : []
  const report = files.map((f) => readJson<A11yRecord>(join(dir, f)))
  writeFileSync(join(results, 'a11y-report.json'), JSON.stringify(report, null, 2))
  const rules: Record<string, number> = {}
  for (const r of report) for (const v of r.violations) rules[v.id] = (rules[v.id] ?? 0) + 1
  console.log(`story-a11y: ${report.length} story/theme pairs with violations`)
  for (const [id, n] of Object.entries(rules).sort((a, b) => b[1] - a[1]))
    console.log(`  ${id}: ${n}`)
} else {
  const dir = join(results, 'walk')
  const names = existsSync(dir) ? readdirSync(dir).sort() : []
  const report = names
    .filter((n) => existsSync(join(dir, n, 'walk.json')))
    .map((n) => readJson<WalkRecord>(join(dir, n, 'walk.json')))
  writeFileSync(join(results, 'walk-report.json'), JSON.stringify(report, null, 2))
  const stops = report.reduce((n, r) => n + r.stops.length, 0)
  console.log(`story-walk: ${report.length} stories walked, ${stops} stops`)
  for (const r of report) console.log(`  ${r.id}: ${r.stops.length} stops, ended ${r.end}`)
}
