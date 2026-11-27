import type { Node, Parser } from 'web-tree-sitter'

import { classifyLines, finishKinds, PUNCTUATION_ONLY, type LineTraits } from '../scan/classify.ts'
import { splitLines, stripBom, type ContentKind } from '../scan/kinds.ts'
import { languageNamed, type Language } from '../scan/language.ts'
import { startsDocBlock, startsDocLine } from '../scan/lexer.ts'
import type { LanguageScanner } from '../scan/registry.ts'
import type { TreeSitterGrammar } from './grammars.ts'

/** What the syntax tree put on one line. */
interface LineMarks extends LineTraits {
  logic: boolean
  import: boolean
  /** The text of punctuation tokens outside imports, e.g. `});`. */
  punctuation: string
  comment: boolean
  /** The grammar could not parse the line. */
  error: boolean
}

/**
 * Whether a node of this type is a string, read as one token. A template
 * string is descended into, as its `${…}` holds code, and so are strings
 * written side by side, as comments may sit between them.
 */
function isStringToken(type: string): boolean {
  return type.includes('string') && type !== 'template_string' && type !== 'concatenated_string'
}

function isDocComment(language: Language, text: string): boolean {
  return startsDocLine(text, 0, language.doc.line) || startsDocBlock(text, 0, language.doc.block)
}

/**
 * An `expression_statement` that is a string opening a module, or the body of
 * a class or function, as Python's docstrings do.
 */
function isDocstring(node: Node): boolean {
  const [only, ...rest] = node.namedChildren
  // Strings side by side are one docstring; a bytes literal is never one.
  const strings = only?.type === 'concatenated_string' ? only.namedChildren : [only]
  if (rest.length > 0 || strings.length === 0) return false
  if (!strings.every((s) => s?.type === 'string' && !/^[a-zA-Z]*[bB]/.test(s.text))) return false
  const parent = node.parent
  const first = parent?.namedChildren.find((c) => c !== null && !c.type.includes('comment'))
  if (parent === null || first?.id !== node.id) return false
  if (parent.type === 'module') return true
  const owner = parent.type === 'block' ? parent.parent?.type : undefined
  return owner === 'function_definition' || owner === 'class_definition'
}

function classifyTree(
  grammar: TreeSitterGrammar,
  language: Language,
  root: Node,
  lines: readonly string[],
): ContentKind[] {
  const marks: LineMarks[] = lines.map(() => ({
    logic: false,
    import: false,
    punctuation: '',
    comment: false,
    doc: false,
    bracedComment: false,
    endsInComment: false,
    error: false,
  }))
  const imports = new Set(grammar.imports)
  const lineTokens = new Set(grammar.lineTokens)

  // A cursor walk, in document order: it neither builds a child array per
  // node nor grows the call stack on a deeply nested file.
  const cursor = root.walk()
  /** Per depth from the root: whether the node there is inside an import. */
  const inImport = [false]
  try {
    walk: for (;;) {
      const type = cursor.nodeType
      // A token the parser inserted to recover from an error takes no room.
      if (cursor.startIndex !== cursor.endIndex) {
        const start = cursor.startPosition.row
        const endPosition = cursor.endPosition
        // A node that ends at a column 0 has stopped at the line before.
        const endRow =
          endPosition.column === 0 && endPosition.row > start
            ? endPosition.row - 1
            : endPosition.row
        const end = Math.min(endRow, lines.length - 1)
        if (type === 'ERROR') for (let r = start; r <= end; r += 1) marks[r]!.error = true
        if (type.includes('comment')) {
          const doc = isDocComment(language, cursor.nodeText)
          for (let r = start; r <= end; r += 1) {
            marks[r]![doc ? 'doc' : 'comment'] = true
            if (r < end) marks[r]!.endsInComment = true
          }
        } else if (
          grammar.docstrings === true &&
          type === 'expression_statement' &&
          isDocstring(cursor.currentNode)
        ) {
          for (let r = start; r <= end; r += 1) marks[r]!.doc = true
        } else {
          const importing =
            inImport.at(-1)! ||
            (imports.has(type) && (grammar.isImport?.(cursor.currentNode) ?? true))
          if (!isStringToken(type) && cursor.gotoFirstChild()) {
            inImport.push(importing)
            continue
          }
          // The token's text per line, where it may be punctuation: a one-line
          // token, or each line of a grammar's `lineTokens`. A string never is.
          const pieces =
            importing || isStringToken(type)
              ? null
              : start === end
                ? [cursor.nodeText]
                : lineTokens.has(type)
                  ? cursor.nodeText.split(/\r?\n/).map((p) => p.trim())
                  : null
          for (let r = start; r <= end; r += 1) {
            const m = marks[r]!
            const piece = pieces?.[r - start] ?? ''
            if (importing) m.import = true
            else if (PUNCTUATION_ONLY.test(piece)) m.punctuation += piece
            else if (pieces === null || piece !== '') m.logic = true
          }
        }
      }
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) break walk
        inImport.pop()
      }
    }
  } finally {
    cursor.delete()
  }
  // Lines the grammar could not parse take the table-driven scanner's reading.
  const fallback = marks.some((m) => m.error) ? classifyLines(language, lines) : null
  const kinds = lines.map((line, i): ContentKind => {
    const m = marks[i]!
    if (m.error && fallback !== null) return fallback[i]!
    if (line.trim() === '') return 'blank'
    if (m.logic) return 'logic'
    if (m.import) return 'boilerplate'
    if (m.punctuation !== '') {
      m.bracedComment = (m.comment || m.doc) && m.punctuation === '{}'
      return 'boilerplate'
    }
    if (m.doc) return 'doc'
    return m.comment ? 'comment' : 'logic'
  })
  return finishKinds(language, lines, kinds, marks)
}

/**
 * A {@link LanguageScanner} over one loaded grammar.
 *
 * @experimental
 */
export function treeSitterScanner(grammar: TreeSitterGrammar, parser: Parser): LanguageScanner {
  const language = languageNamed(grammar.language)
  if (language === null) throw new Error(`grammar ${grammar.id}: no language '${grammar.language}'`)
  const extensions = grammar.extensions.map((e) => `.${e}`)
  return {
    id: `tree-sitter-${grammar.id}`,
    language: language.name,
    category: language.category,
    matches: (path) => extensions.some((e) => path.toLowerCase().endsWith(e)),
    scan(text) {
      const lines = splitLines(text)
      const tree = parser.parse(stripBom(text))
      if (tree === null) throw new Error('the parser returned no tree')
      try {
        return classifyTree(grammar, language, tree.rootNode, lines)
      } finally {
        tree.delete()
      }
    },
  }
}
