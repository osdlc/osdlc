/** Review the current branch against main and print each finding. */
import { reviewChanges } from '@osdlc/rule-review'

const run = await reviewChanges({ base: 'main' })

for (const f of run.findings) {
  const where = f.line === undefined ? f.file : `${f.file}:${f.line}`
  console.log(`${f.severity} ${where} (${f.sourcePath}): ${f.why}`)
}
if (run.degraded) console.error('Some rule files could not be judged.')
process.exitCode = run.findings.some((f) => f.severity === 'violation') ? 1 : 0
