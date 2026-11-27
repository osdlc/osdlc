import type { ContentKind } from './kinds.ts'
import { lineCommentOpens, type Language } from './language.ts'

const COMMENT_OPENERS: readonly string[] = ['//', '/*', '*/', '*', '#', '<!--', '-->', '--', ';']

/**
 * The one-line fallback: a line is a comment when it starts with a comment
 * opener after indentation. It needs no surrounding lines, so it serves lines
 * whose file cannot be read or scanned, and a caller that wants a rule with no
 * false negatives on lines that start with a comment marker. With a language,
 * the openers are its line markers, as {@link lineCommentOpens} reads them,
 * its block-comment markers, and `*` for the middle lines of a `/*` block;
 * without one, a fixed list of common ones. It over-reports comments: a Rust
 * `#[derive]` reads as one without a language, and code after a closing `*\/`
 * reads as one either way.
 */
export function prefixKind(line: string, language?: Language | null): ContentKind {
  const s = line.trim()
  if (s === '') return 'blank'
  if (language == null) return COMMENT_OPENERS.some((c) => s.startsWith(c)) ? 'comment' : 'logic'
  const at = line.length - line.trimStart().length
  const opens = (m: string) => s.startsWith(m) && lineCommentOpens(language, m, line, at)
  if (language.lineComments.some(opens)) return 'comment'
  const blocks = language.blockComments
  if (blocks.some(([open, close]) => s.startsWith(open) || s.startsWith(close))) return 'comment'
  return s.startsWith('*') && blocks.some(([open]) => open === '/*') ? 'comment' : 'logic'
}
