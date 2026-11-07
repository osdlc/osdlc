// One stand-in Playwright worker for budget.test.ts: waits for a shared start
// time so every worker writes at once, then records `count` verdicts.
import { createPerfRecorder } from '../../src/playwright/budget.ts'

const [outFile = '', runId, worker, count, startAt] = process.argv.slice(2)
// Sleep rather than spin, so waiting workers leave the CPU to other tests.
const wait = Number(startAt) - Date.now()
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
const { budget } = createPerfRecorder({ outFile, env: { STORY_PERF_RUN: runId ?? '' } })
for (let i = 0; i < Number(count); i++) budget(`w${worker}-${i}`, 1, 2)
