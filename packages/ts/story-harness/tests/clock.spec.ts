import { expect, test } from '@playwright/test'
import { preparePage, START_TIME } from '../src/playwright/index.ts'

const blank = 'data:text/html,<title>blank</title>'
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('the default call starts Date.now at START_TIME', async ({ page }) => {
  await preparePage(page)
  await page.goto(blank)
  const now = await page.evaluate(() => Date.now())
  expect(now - START_TIME.getTime()).toBeGreaterThanOrEqual(0)
  expect(now - START_TIME.getTime()).toBeLessThan(5_000)
})

test('with clock: false, performance.now and Date.now run in real time', async ({ page }) => {
  await preparePage(page, { clock: false })
  await page.goto(blank)
  const read = () => page.evaluate(() => ({ perf: performance.now(), date: Date.now() }))
  const before = await read()
  expect(Math.abs(before.date - Date.now())).toBeLessThan(5_000)
  await pause(300)
  const after = await read()
  expect(after.perf - before.perf).toBeGreaterThanOrEqual(250)
  expect(after.date - before.date).toBeGreaterThanOrEqual(250)
})

for (const timer of ['setTimeout', 'setInterval', 'requestAnimationFrame'] as const) {
  test(`an error thrown in ${timer} under the default clock is a page error`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await preparePage(page)
    await page.goto(blank)
    await page.evaluate((name) => {
      const id = (window as any)[name](() => {
        if (name === 'setInterval') clearInterval(id)
        throw new Error(`boom in ${name}`)
      }, 0)
    }, timer)
    await expect.poll(() => pageErrors).toEqual([`boom in ${timer}`])
  })
}
