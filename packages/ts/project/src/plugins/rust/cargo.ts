/**
 * cargo — the conventional verbs a Rust crate answers to.
 *
 * The clearest example of `origin: "synthesized"` in the package. Nothing in a
 * Cargo.toml declares `cargo test` or `cargo clippy`; they are what a crate
 * runs because it is a crate.
 *
 * A consumer that only wants what a repo actually wrote down filters these out
 * with `origin === "declared"`, which is why the field exists.
 */

import type { ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { Package, RunnerRole } from '../../tool.ts'
import { afterSeparator, taskId } from '../support/shared.ts'
import { CARGO_TOML } from './ecosystem.ts'

const CHAIN = [
  { label: 'runner', hint: 'cargo builds, tests and lints Rust crates.' },
  { label: 'crate', hint: 'The directory holding the Cargo.toml. `.` is the root manifest.' },
  { label: 'verb', hint: 'A conventional cargo verb. Synthesized — not declared in the manifest.' },
]

/** The verbs worth offering. Deliberately short: these are conventions, not config. */
const VERBS: ReadonlyArray<{ name: string; args: string[] }> = [
  { name: 'test', args: ['test'] },
  { name: 'clippy', args: ['clippy'] },
  { name: 'fmt', args: ['fmt'] },
  { name: 'fmt-check', args: ['fmt', '--check'] },
  { name: 'build', args: ['build'] },
  { name: 'clean', args: ['clean'] },
]

/**
 * A shipping crate — cargo ships crates. A substitute glyph, kept after
 * checking simple-icons: its `rust` icon is CC-BY-SA-4.0, not CC0 (the Rust
 * logo's own license), which an MIT package cannot pass on — and its path is
 * ~4.1KB besides. Color is GitHub Linguist's rust-orange for the language.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.9 20.4 7v10L12 21.1 3.6 17V7Z"/><path d="M3.6 7 12 11.2 20.4 7M12 11.2V21"/></svg>',
  color: '#dea584',
}

export const cargoRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,

  async collect(_ctx, packages: readonly Package[]): Promise<ProviderResult> {
    const tasks: Task[] = []
    for (const pkg of packages) {
      const file = pkg.manifestFiles.find((f) => f === CARGO_TOML || f.endsWith(`/${CARGO_TOML}`))
      if (file === undefined) continue
      const dir = pkg.dir
      for (const verb of VERBS) {
        const argv =
          dir === '.' ? ['cargo', ...verb.args] : ['cargo', ...verb.args, '--manifest-path', file]
        tasks.push({
          id: taskId('cargo', file, verb.name),
          runner: 'cargo',
          path: ['cargo', dir, verb.name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'synthesized',
          tags: ['cargo', 'rust', dir],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
  },

  /** `cargo run` passes its own flags up to `--`, and the program's after it. */
  invoke(task, args) {
    return task.argv[1] === 'run' ? afterSeparator(task, args) : [...task.argv, ...args]
  },
}
