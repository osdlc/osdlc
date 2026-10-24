/** Reading the git hooks lefthook, husky and pre-commit configure. */

import { parse as parseToml } from 'smol-toml'

import type { ProviderContext } from '../../contract.ts'
import type { HookDef, Package } from '../../tool.ts'
import { isTable } from '../support/shared.ts'

/** The client-side hooks `git help hooks` lists. */
export const GIT_HOOKS: readonly string[] = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'post-rewrite',
  'pre-auto-gc',
  'fsmonitor-watchman',
  'post-index-change',
  'sendemail-validate',
  'reference-transaction',
  'push-to-checkout',
]

export const LEFTHOOK_CONFIGS = [
  '/lefthook.yml',
  '/lefthook.yaml',
  '/.lefthook.yml',
  '/.lefthook.yaml',
  '/lefthook.json',
  '/lefthook.toml',
]

export const PRE_COMMIT_CONFIGS = ['/.pre-commit-config.yaml', '/.pre-commit-config.yml']

export const HUSKY_DIR = '/.husky/'

/** The git hooks a lefthook config declares, as top-level keys. */
export async function lefthookHooks(ctx: ProviderContext, config: string): Promise<HookDef[]> {
  const text = await ctx.readText(config)
  if (text === null) return []
  let keys: string[]
  if (config.endsWith('.json')) {
    const parsed = await ctx.readJson(config)
    keys = isTable(parsed) ? Object.keys(parsed) : []
  } else if (config.endsWith('.toml')) {
    try {
      keys = Object.keys(parseToml(text))
    } catch {
      keys = []
    }
  } else {
    keys = [...text.matchAll(/^([A-Za-z][\w-]*)\s*:/gm)].map((m) => m[1]!)
  }
  return unique(keys.filter((k) => GIT_HOOKS.includes(k))).map((name) => ({
    name,
    argv: ['lefthook', 'run', name],
    source: config,
  }))
}

/** The hook scripts directly under `.husky/`. */
export async function huskyHooks(ctx: ProviderContext): Promise<HookDef[]> {
  const files = await ctx.files(HUSKY_DIR)
  return files
    .filter((f) => f.startsWith('.husky/') && GIT_HOOKS.includes(f.slice('.husky/'.length)))
    .sort()
    .map((source) => ({ name: source.slice('.husky/'.length), argv: ['sh', source], source }))
}

/** The hook ids a pre-commit config declares, each run on every file. */
export async function preCommitHooks(ctx: ProviderContext, config: string): Promise<HookDef[]> {
  const text = await ctx.readText(config)
  if (text === null) return []
  const ids = [...text.matchAll(/^\s*-\s*id:\s*['"]?([^'"\s#]+)/gm)].map((m) => m[1]!)
  return unique(ids).map((id) => ({
    name: id,
    argv: ['pre-commit', 'run', id, '--all-files'],
    source: config,
  }))
}

/**
 * husky 9 arms with `husky`; earlier majors with `husky install`. The major
 * comes from the root `package.json`'s husky specifier; with none, 9.
 */
export function huskyArm(pkg: Package): string[] {
  const spec = pkg.manifests.packageJson?.deps?.find((d) => d.name === 'husky')?.specifier
  const major = spec === undefined ? undefined : Number(/(\d+)/.exec(spec)?.[1])
  return major !== undefined && Number.isFinite(major) && major < 9
    ? ['npx', 'husky', 'install']
    : ['npx', 'husky']
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
