import { expect, test } from 'vitest'

import { diffApi, loadTypeScript, parseSource, type ApiMap } from '@osdlc/code-stats/analysis'

test('the public API delta of two versions of a declaration list', () => {
  // `typescript` is an optional peer: null when the project has none.
  const ts = loadTypeScript(process.cwd())
  if (ts === null) throw new Error('this example needs the typescript package')

  // The top-level functions of a file by name, each with its text as one version of the file writes it.
  const functions = (path: string, text: string): ApiMap =>
    new Map(
      parseSource(ts, path, text)
        .statements.filter((s) => ts.isFunctionDeclaration(s) && s.name !== undefined)
        .map((s) => [(s as import('typescript').FunctionDeclaration).name!.text, s.getText()]),
    )

  const before = functions(
    'a.ts',
    'function keep(): number\nfunction drop(): void\nfunction edit(): number\n',
  )
  const after = functions(
    'a.ts',
    'function keep(): number\nfunction edit(): string\nfunction add(): void\n',
  )

  expect(diffApi(before, after)).toEqual({ added: ['add'], removed: ['drop'], changed: ['edit'] })
})
