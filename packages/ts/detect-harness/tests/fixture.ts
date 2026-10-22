/**
 * Temporary-folder fixtures for the detect tests. Each fixture has its own
 * home, project and system root, so no test reads the real home folder.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { detect } from '../src/detect.ts'
import type { DetectOptions } from '../src/contract.ts'
import type { HarnessCatalog, HarnessReport } from '../src/report.ts'

export interface Fixture {
  root: string
  home: string
  project: string
  system: string
  bin: string
  /** Write files under `base`; an object value is written as JSON. */
  write(base: string, files: Record<string, string | object>): void
  /** An executable stub named `name` in `bin`. */
  binary(name: string): string
  /** `detect()` against this fixture, with an empty environment except `PATH`. */
  detect(options?: DetectOptions): Promise<HarnessCatalog>
  report(harness: string, options?: DetectOptions): Promise<HarnessReport>
  cleanup(): void
}

export function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'detect-harness-'))
  const home = join(root, 'home')
  const project = join(root, 'project')
  const system = join(root, 'system')
  const bin = join(root, 'bin')
  for (const d of [home, project, system, bin]) mkdirSync(d, { recursive: true })

  const write = (base: string, files: Record<string, string | object>): void => {
    for (const [rel, content] of Object.entries(files)) {
      const path = join(base, rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
    }
  }

  const run = (options: DetectOptions = {}): Promise<HarnessCatalog> =>
    detect({
      projectRoot: project,
      home,
      systemRoot: system,
      platform: 'linux',
      ...options,
      env: { PATH: bin, ...options.env },
    })

  return {
    root,
    home,
    project,
    system,
    bin,
    write,
    binary: (name) => {
      const path = join(bin, name)
      writeFileSync(path, '#!/bin/sh\necho "1.2.3"\n')
      chmodSync(path, 0o755)
      return path
    },
    detect: run,
    report: async (harness, options) => {
      const catalog = await run({ ...options, only: [harness] })
      return catalog.reports[0]!
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
