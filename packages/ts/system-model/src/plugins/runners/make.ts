/**
 * make: targets scanned from a Makefile.
 *
 * The scan is cautious on purpose and will miss things: `include`d makefiles,
 * targets built by pattern rules, anything generated at parse time. It reports
 * only what is written at column 0.
 *
 * Unlike just, rake, go-task and gradle, make has no exec path when execution
 * is allowed. Consent is not the problem; the output is. `make
 * --print-data-base` was tested on a fixture with an `include`, a pattern rule
 * and `$(eval)`-built targets. Over 98% of its 1354 lines were make's own
 * built-in rules and variables. A real target could be told apart from a
 * pattern-rule expansion only by free-text comments, and the same target
 * appeared twice. The format is debugging output, not a stable interface, and
 * BSD make does not have the flag. It also evaluates the makefile: `$(shell …)`
 * in a `:=` assignment runs during parsing, and neither `-n` nor `-q` stops
 * it. Bare `-p` then builds the default goal. So no invocation gives an answer
 * that could be trusted, even with consent.
 */

import type { ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, onePerDir, sourcesOf, taskId } from '../support/shared.ts'

/** The names make looks for, in the order GNU make tries them. */
export const MAKEFILE_NAMES = ['GNUmakefile', 'makefile', 'Makefile']

const CHAIN = [
  { label: 'runner', hint: 'make builds targets declared in a Makefile.' },
  { label: 'makefile', hint: 'Which makefile declares the target. `.` is the one at the root.' },
  { label: 'target', hint: 'The target name, as written at column 0 before the colon.' },
]

/**
 * `names:` at column 0, one or more names before the colon. Not `name :=`,
 * `name ::=` or `name :::=`: those are variable assignments.
 */
const TARGET = /^([^:#=\s][^:#=]*):(?!:*=)/

/** One target name. A line with any other word before the colon is skipped. */
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/

/**
 * A plain gear glyph. simple-icons has no icon for make (`make` is Make.com,
 * an unrelated product, and there is no `gnumake`). Its `gnu` head is
 * CC-BY-SA-2.0, not CC0, which an MIT package cannot pass on, and its path is
 * about 14.7KB. GNU has no official color; this is the deep red usually used
 * for GNU marks.
 */
export const MAKE_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="10.9" y="2" width="2.2" height="5" rx="1"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(45 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(90 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(135 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(180 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(225 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(270 12 12)"/><rect x="10.9" y="2" width="2.2" height="5" rx="1" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
  color: '#a42e2b',
}

export const makeRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx, packages): Promise<ProviderResult> {
    // make reads one makefile per directory, the first of MAKEFILE_NAMES it finds.
    const makefiles = onePerDir(sourcesOf(packages, 'make', MAKEFILE_NAMES), MAKEFILE_NAMES)
    if (makefiles.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const tasks: Task[] = []
    for (const file of makefiles) {
      const text = await ctx.readText(file)
      if (text === null) continue
      const dir = dirOf(file)
      for (const name of scanTargets(text)) {
        const argv = dir === '.' ? ['make', name] : ['make', '-C', dir, name]
        tasks.push({
          id: taskId('make', file, name),
          runner: 'make',
          path: ['make', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          tags: ['make', dir],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }
    }

    return {
      status: 'ok',
      tasks,
      diagnostics: [],
    }
  },
}

export function scanTargets(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw[0] === ' ' || raw[0] === '\t' || raw[0] === '#') continue
    const m = TARGET.exec(raw)
    if (m === null) continue
    const names = m[1]!.trim().split(/\s+/)
    // `$(eval …)`, `$(info a: b)` and the like are not target lists.
    if (!names.every((name) => NAME.test(name))) continue
    for (const name of names) {
      // `.PHONY` and similar names are directives, not things to run. `%` marks
      // a pattern rule, which is not a single target.
      if (name.startsWith('.') || name.includes('%')) continue
      if (seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
  }
  return out.sort()
}
