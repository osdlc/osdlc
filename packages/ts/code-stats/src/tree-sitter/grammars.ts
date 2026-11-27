/** The part of a tree-sitter node the grammar rules read. */
export interface SyntaxNodeLike {
  type: string
  text: string
  namedChildren: readonly (SyntaxNodeLike | null)[]
  childForFieldName(name: string): SyntaxNodeLike | null
}

/** How one tree-sitter grammar is found, which files it reads, and which of its nodes are imports. */
export interface TreeSitterGrammar {
  /** The grammar's own name, as in `tree-sitter-<id>.wasm`. */
  id: string
  /** The built-in table's name for the language, whose doc markers and directives apply. */
  language: string
  /** Lower-case extensions, without the dot. */
  extensions: readonly string[]
  /** The npm package that ships the grammar, and its `.wasm` file inside that package. */
  wasm: { package: string; file: string }
  /** Statement nodes that may be boilerplate: imports, re-exports, module declarations. */
  imports: readonly string[]
  /** Narrows {@link imports}: whether this node of one of those types is boilerplate. Default yes. */
  isImport?: (node: SyntaxNodeLike) => boolean
  /** Whether a string that opens a module, class or function body is a docstring, as in Python. */
  docstrings?: boolean
  /**
   * Multi-line tokens read a line at a time, as the table reads them: a line
   * of one that holds only brackets and separators, such as a C macro body's
   * closing `}`, is boilerplate.
   */
  lineTokens?: readonly string[]
}

const DIRECTIVE = /^['"]use (?:strict|client|server)['"]$/
const REQUIRE = /^require\(\s*['"][^'"]*['"]\s*\)$/

const TS_IMPORTS = [
  'import_statement',
  'export_statement',
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
]

/** A node's named children other than comments, which automatic semicolon insertion can fold in. */
const code = (node: SyntaxNodeLike) =>
  node.namedChildren.filter((c): c is SyntaxNodeLike => c !== null && !c.type.includes('comment'))

/**
 * An import, a re-export (`export … from`) or an export list (`export { a }`),
 * a `'use strict'` directive, or a declaration whose every value is
 * `require('…')`. Not an exported declaration, `export default`, `export =`
 * or `export as namespace`, which carry logic.
 */
function isTsImport(node: SyntaxNodeLike): boolean {
  switch (node.type) {
    case 'export_statement': {
      if (node.childForFieldName('source') !== null) return true
      const parts = code(node)
      return parts.length === 1 && parts[0]!.type === 'export_clause'
    }
    case 'expression_statement': {
      const [only, ...rest] = code(node)
      return rest.length === 0 && only?.type === 'string' && DIRECTIVE.test(only.text)
    }
    case 'lexical_declaration':
    case 'variable_declaration':
      return code(node).every((d) => {
        const value = d.childForFieldName('value')
        return value != null && REQUIRE.test(value.text)
      })
    default:
      return true
  }
}

/** A body-less `mod x;`, `package a.b` or `namespace A;`, not one that holds its items inline. */
const withoutBody = (node: SyntaxNodeLike): boolean => node.childForFieldName('body') === null

/**
 * `#include`, `#import` and `#pragma once`; other directives, such as
 * `#define`, carry logic. Inside a struct or enum body the grammar reads an
 * `#include` as a generic directive, a `preproc_call`.
 */
function isCImport(node: SyntaxNodeLike): boolean {
  if (node.type !== 'preproc_call') return true
  const directive = node.childForFieldName('directive')?.text.replace(/\s+/g, '')
  const argument = node.childForFieldName('argument')?.text.trim()
  return (
    directive === '#include' ||
    directive === '#import' ||
    (directive === '#pragma' && argument === 'once')
  )
}

const C_IMPORTS = ['preproc_include', 'preproc_call']

/** A `require` or `require_relative` call, with no receiver, perhaps under a trailing `if` or `unless`. */
function isRubyRequire(node: SyntaxNodeLike): boolean {
  if (node.type !== 'call') {
    const body = node.childForFieldName('body')
    return body !== null && body.type === 'call' && isRubyRequire(body)
  }
  const method = node.childForFieldName('method')?.text
  return (
    node.childForFieldName('receiver') === null &&
    (method === 'require' || method === 'require_relative')
  )
}

const PHP_INCLUDE = /^(?:require|include)(?:_once)?_expression$/

/**
 * `<?php` on a line of its own (the code after it on the line is logic), a
 * `use`, a body-less `namespace A;`, or a statement that is only a `require`
 * or `include`.
 */
function isPhpImport(node: SyntaxNodeLike): boolean {
  switch (node.type) {
    case 'php_tag':
      return node.text.toLowerCase() === '<?php'
    case 'namespace_definition':
      return withoutBody(node)
    case 'expression_statement': {
      const [only, ...rest] = code(node)
      return rest.length === 0 && only !== undefined && PHP_INCLUDE.test(only.type)
    }
    default:
      return true
  }
}

/** `source file` or `. file`. */
function isShellSource(node: SyntaxNodeLike): boolean {
  const name = node.childForFieldName('name')?.text
  return (name === 'source' || name === '.') && node.childForFieldName('argument') !== null
}

/**
 * The tree-sitter grammars the package knows, with the npm packages that hold their `.wasm` files.
 *
 * @experimental
 */
export const BUILTIN_GRAMMARS: readonly TreeSitterGrammar[] = [
  {
    id: 'typescript',
    language: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    wasm: { package: 'tree-sitter-typescript', file: 'tree-sitter-typescript.wasm' },
    imports: TS_IMPORTS,
    isImport: isTsImport,
  },
  {
    id: 'tsx',
    language: 'TypeScript',
    extensions: ['tsx'],
    wasm: { package: 'tree-sitter-typescript', file: 'tree-sitter-tsx.wasm' },
    imports: TS_IMPORTS,
    isImport: isTsImport,
  },
  {
    id: 'javascript',
    language: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs', 'jsx'],
    wasm: { package: 'tree-sitter-javascript', file: 'tree-sitter-javascript.wasm' },
    imports: TS_IMPORTS,
    isImport: isTsImport,
  },
  {
    id: 'rust',
    language: 'Rust',
    extensions: ['rs'],
    wasm: { package: 'tree-sitter-rust', file: 'tree-sitter-rust.wasm' },
    imports: ['use_declaration', 'extern_crate_declaration', 'mod_item'],
    isImport: (node) => node.type !== 'mod_item' || withoutBody(node),
  },
  {
    id: 'python',
    language: 'Python',
    extensions: ['py', 'pyi'],
    wasm: { package: 'tree-sitter-python', file: 'tree-sitter-python.wasm' },
    imports: ['import_statement', 'import_from_statement', 'future_import_statement'],
    docstrings: true,
  },
  {
    id: 'scala',
    language: 'Scala',
    extensions: ['scala', 'sc'],
    wasm: { package: 'tree-sitter-scala', file: 'tree-sitter-scala.wasm' },
    imports: ['import_declaration', 'package_clause'],
    isImport: (node) => node.type !== 'package_clause' || withoutBody(node),
  },
  {
    id: 'go',
    language: 'Go',
    extensions: ['go'],
    wasm: { package: 'tree-sitter-go', file: 'tree-sitter-go.wasm' },
    imports: ['package_clause', 'import_declaration'],
  },
  {
    id: 'java',
    language: 'Java',
    extensions: ['java'],
    wasm: { package: 'tree-sitter-java', file: 'tree-sitter-java.wasm' },
    imports: ['package_declaration', 'import_declaration'],
  },
  {
    // A `.h` file is read as C, as the table reads it; C++ in one leaves
    // error nodes, whose lines take the table's reading.
    id: 'c',
    language: 'C',
    extensions: ['c', 'h'],
    wasm: { package: 'tree-sitter-c', file: 'tree-sitter-c.wasm' },
    imports: C_IMPORTS,
    isImport: isCImport,
    lineTokens: ['preproc_arg'],
  },
  {
    id: 'cpp',
    language: 'C++',
    extensions: [
      'cc',
      'cpp',
      'cxx',
      'c++',
      'ccm',
      'cppm',
      'cxxm',
      'c++m',
      'hh',
      'hpp',
      'hxx',
      'h++',
      'inl',
      'ipp',
      'ixx',
      'tpp',
    ],
    wasm: { package: 'tree-sitter-cpp', file: 'tree-sitter-cpp.wasm' },
    imports: C_IMPORTS,
    isImport: isCImport,
    lineTokens: ['preproc_arg'],
  },
  {
    id: 'c_sharp',
    language: 'C#',
    extensions: ['cs', 'csx'],
    wasm: { package: 'tree-sitter-c-sharp', file: 'tree-sitter-c_sharp.wasm' },
    imports: ['using_directive', 'file_scoped_namespace_declaration'],
  },
  {
    id: 'ruby',
    language: 'Ruby',
    extensions: ['rb'],
    wasm: { package: 'tree-sitter-ruby', file: 'tree-sitter-ruby.wasm' },
    imports: ['call', 'if_modifier', 'unless_modifier'],
    isImport: isRubyRequire,
  },
  {
    // The grammar that reads the HTML around `<?php … ?>`, not `php_only`.
    id: 'php',
    language: 'PHP',
    extensions: ['php'],
    wasm: { package: 'tree-sitter-php', file: 'tree-sitter-php.wasm' },
    imports: [
      'php_tag',
      'namespace_use_declaration',
      'use_declaration',
      'namespace_definition',
      'expression_statement',
    ],
    isImport: isPhpImport,
  },
  {
    id: 'bash',
    language: 'BASH',
    extensions: ['sh', 'bash', 'bashrc', 'bash_profile', 'bash_login', 'bash_logout'],
    wasm: { package: 'tree-sitter-bash', file: 'tree-sitter-bash.wasm' },
    imports: ['command'],
    isImport: isShellSource,
  },
]
