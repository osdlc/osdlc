/**
 * Where cargo writes build output, asked of cargo rather than derived from a
 * path: workspace membership decides it.
 */
import { type CommandRunner, runChecked, spawnRunner } from '@osdlc/command-seam'

/** Options for {@link cargoTargetDir}. */
export interface CargoTargetDirOptions {
  /** The directory cargo runs in. */
  cwd: string
  /** A crate outside the workspace at `cwd` has its own target dir. */
  manifestPath?: string
  /** Runs `cargo`. Defaults to spawning it; a test passes a fake. */
  runner?: CommandRunner
}

/**
 * Cargo's target directory, from `cargo metadata --no-deps`. Throws when cargo
 * fails, or when its output has no `target_directory`.
 */
export function cargoTargetDir({
  cwd,
  manifestPath,
  runner = spawnRunner('cargo'),
}: CargoTargetDirOptions): string {
  const argv = ['metadata', '--no-deps', '--format-version', '1']
  if (manifestPath !== undefined) argv.push('--manifest-path', manifestPath)
  const { stdout } = runChecked(runner, argv, { cwd })
  const dir = (JSON.parse(stdout) as { target_directory?: unknown }).target_directory
  if (typeof dir !== 'string' || dir === '') {
    throw new Error('cargo metadata printed no target_directory')
  }
  return dir
}
