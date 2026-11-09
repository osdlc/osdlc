// The one helper a TypeScript benchmark file uses. A bench file registers a
// vitest test and hands its `bench` fixture and a record of cases to
// `runCases`; each case becomes one gated benchmark, reported as
// `<test title>/<case name>`:
//
//   import { test } from 'vitest'
//   import { corpus } from '../../../../bench/corpus/index.ts'
//   import { runCases } from '../../../../bench/suite.ts'
//   import { scanBodyWith } from '../src/index.ts'
//
//   const { bodies } = corpus()
//   test('scanBodyWith', ({ bench }) =>
//     runCases(bench, { vault: () => { for (const b of bodies) scanBodyWith(b, {}) } }))
//
// The cases run one after another, so one case never competes with another
// for the CPU. It takes `bench` structurally so this file needs no vitest
// install of its own.

/** The part of vitest's `bench` fixture this helper calls. */
export type BenchFixture = (
  name: string,
  fn: () => void | Promise<void>,
) => { run(): Promise<unknown> };

/** Time each case in turn. */
export async function runCases(
  bench: BenchFixture,
  cases: Record<string, () => void | Promise<void>>,
): Promise<void> {
  for (const [name, fn] of Object.entries(cases)) {
    await bench(name, fn).run();
  }
}
