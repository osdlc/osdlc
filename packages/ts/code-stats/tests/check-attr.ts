import { runFailed } from '@osdlc/command-seam'

import type { Repo } from '../src/git/repo.ts'
import { isLinguistAttribute, LINGUIST_ATTRIBUTES, linguistValue } from '../src/linguist.ts'
import type { LinguistAttributes } from '../src/types.ts'

/** Git's own answer, `git check-attr` (`--source` at a commit, git 2.40+), for checking the readers against. */
export function checkAttr(
  repo: Repo,
  paths: readonly string[],
  rev: string | null,
): Map<string, LinguistAttributes> {
  const argv = ['check-attr', '-z', '--stdin']
  if (rev !== null) argv.push(`--source=${rev}`)
  argv.push(...Object.keys(LINGUIST_ATTRIBUTES))
  const r = repo.git.raw(argv, { input: `${paths.join('\0')}\0` })
  if (runFailed(r)) throw new Error(r.stderr)
  const out = new Map<string, LinguistAttributes>()
  const fields = r.stdout.split('\0')
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [path, attr, value] = [fields[i]!, fields[i + 1]!, fields[i + 2]!]
    const v = linguistValue(value)
    if (!isLinguistAttribute(attr) || v === undefined) continue
    out.set(path, { ...out.get(path), [LINGUIST_ATTRIBUTES[attr]]: v })
  }
  return out
}

/**
 * `.gitattributes` files and an `info/attributes` (at `.git/info/attributes`)
 * that use `[attr]` macros, and the paths to ask about, for checking the
 * readers' macro handling against {@link checkAttr}.
 */
export const MACRO_CASE = {
  files: {
    '.gitattributes': [
      '[attr]gen linguist-generated',
      '[attr]all gen linguist-documentation',
      '[attr]redef linguist-generated',
      '[attr]loop1 loop2',
      '[attr]loop2 loop1 linguist-vendored',
      'dist/** gen',
      'both/** all',
      'keep/** gen',
      'keep/off.ts -gen',
      'mix.ts gen -linguist-generated',
      'mix2.ts -linguist-generated gen',
      'value.ts gen=x',
      'unset.ts -gen',
      'r.ts redef',
      'doc/** inf',
      'loop.ts loop1',
      'undefined.ts nosuchmacro',
      '',
    ].join('\n'),
    'sub/.gitattributes': '[attr]local linguist-vendored\nlocal.ts local\nuses.ts gen\n',
  },
  info: '[attr]inf linguist-documentation\n[attr]redef linguist-vendored\n',
  paths: [
    'dist/a.js',
    'both/b.ts',
    'keep/on.ts',
    'keep/off.ts',
    'mix.ts',
    'mix2.ts',
    'value.ts',
    'unset.ts',
    'r.ts',
    'doc/x.md',
    'loop.ts',
    'undefined.ts',
    'sub/local.ts',
    'sub/uses.ts',
    'plain.ts',
  ],
} as const
