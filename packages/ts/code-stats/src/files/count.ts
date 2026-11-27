import { realpathSync } from 'node:fs'

import { checkoutRoot } from '@osdlc/typed-git'

import { CodeStatsError } from '../error.ts'
import { relativeWithin } from '../paths.ts'
import { buildCountReport, type CountFile, type CountOptions } from '../report/count.ts'
import { emptyPathsNote } from '../report/notes.ts'
import type { CountReport } from '../report/schema.ts'
import { readLinguistAttributes } from './attributes.ts'
import { readFile } from './read.ts'
import { listFiles } from './walk.ts'

/**
 * Options for {@link countDirectory}: the directory and paths to count, and the report's {@link
 * CountOptions}.
 */
export interface CountDirectoryOptions extends CountOptions {
  /** The directory to count. */
  dir: string
  /** Files or directories, relative to `dir`; absent or empty is all of it. */
  paths?: readonly string[]
  /** Files larger than this are not read. Default 2 MB. */
  maxBytes?: number
  /** Honour linguist attributes in `.gitattributes`. Default true. */
  linguist?: boolean
}

/**
 * Lines by kind, language and group for the files under a directory, read
 * from disk; git is never run, and need not be installed. Inside a
 * repository, the `.gitignore` and `.gitattributes` files from its top down
 * apply, as they would to git, so counting a subdirectory leaves out what
 * counting from the top would. A file committed although a `.gitignore`
 * matches it is left out, since only git's index knows it was committed.
 * Files are read one at a time as they are counted, so only one is held.
 */
export function countDirectory(options: CountDirectoryOptions): CountReport {
  let dir: string
  try {
    dir = realpathSync(options.dir)
  } catch {
    throw new CodeStatsError(`no such directory: ${options.dir}`, { kind: 'bad-input' })
  }
  // The checkout is found on disk, by its `.git` entry: no git runs.
  const checkout = checkoutRoot(dir)
  const top = checkout ?? dir
  const prefix = relativeWithin(top, dir) ?? '.'
  const fromTop = (p: string) => (prefix === '.' ? p : p === '.' ? prefix : `${prefix}/${p}`)
  const fromDir = (p: string) => (prefix === '.' ? p : p.slice(prefix.length + 1))

  const paths = (options.paths ?? []).map((p) => {
    const rel = relativeWithin(dir, p)
    if (rel === null) {
      throw new CodeStatsError(`${p} is outside ${options.dir}`, { kind: 'bad-input' })
    }
    return rel
  })
  const scope = paths.length === 0 || paths.includes('.') ? [fromTop('.')] : paths.map(fromTop)
  const files = listFiles(
    top,
    scope.filter((p) => p !== '.'),
    checkout !== null,
  )
  const attributes = options.linguist === false ? null : readLinguistAttributes(top, files)

  function* read(): Generator<CountFile> {
    for (const path of files) {
      yield {
        path: fromDir(path),
        content: readFile(top, path, options.maxBytes),
        attributes: attributes?.get(path),
      }
    }
  }
  const report = buildCountReport({ label: 'files on disk', commit: null }, paths, read(), options)
  const note = emptyPathsNote(paths, files.map(fromDir))
  if (note !== null) report.notes.push(note)
  return report
}
