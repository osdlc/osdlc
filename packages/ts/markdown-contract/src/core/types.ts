/**
 * The public types: the parse tree, findings, the contract grammar and the typed model. This
 * module holds interfaces and type aliases only.
 */
import type { Root } from 'mdast'
import type { Extension } from 'micromark-util-types'
import type { ZodType } from 'zod'

/** The remark (mdast) root of a parsed document. */
export type Mdast = Root

/**
 * A micromark syntax extension, passed to `parse()` in `ParseOptions.extensions`. This is
 * micromark's own `Extension` type.
 */
export type MicromarkExtension = Extension

// ── The parse tree ──────────────────────────────────────────────────────────────

/**
 * A point in the source: a 1-based line and, when known, a 1-based column. It is not named
 * `Position` because unist uses that name for a start and end range.
 */
export interface SourcePos {
  line: number
  col?: number
}

/**
 * The source range and raw text of one inline code run. The flattened text of a table cell or
 * paragraph drops the backticks, so it cannot tell inline code from prose; these spans keep it.
 *
 * `start` is the opening backtick. `end` is one column past the closing backtick (unist's
 * end-exclusive convention). `raw` is the source between them, backticks included.
 */
export interface InlineSpan {
  start: SourcePos
  end: SourcePos
  raw: string
}

/** Options for `parse()`. */
export interface ParseOptions {
  /**
   * Extra micromark syntax extensions, added after the built-in ones (GFM and frontmatter).
   * A syntax extension changes how text is tokenized; one that adds a construct needs a
   * matching mdast extension to produce nodes, which `parse()` does not take. A common use is
   * turning a construct off, for example `{ disable: { null: ['codeIndented'] } }`.
   */
  extensions?: MicromarkExtension[]
}

/**
 * The result of `parse()`: the frontmatter, the body text, the tree of heading sections and the
 * remark tree. A contract validates this; parse once to validate one document against several
 * contracts.
 */
export interface DocTree {
  /** The frontmatter block, or `null` when the document has none. */
  frontmatter: {
    /** The YAML text between the fences. */
    raw: string
    /** The parsed YAML value. */
    data: unknown
    /** The position of the opening fence. */
    pos: SourcePos
    /** The source line of the key at a path into `data`, such as `['tags', 0]`. */
    lineForPath(path: (string | number)[]): number | undefined
  } | null
  /** The source after the frontmatter block, or the whole source when there is none. */
  body: string
  /** The document root. Its name is the H1 title, or `""`; `root.sections` are the H2s. */
  root: SectionNode
  /** The remark (mdast) tree the sections were built from. */
  mdast: Mdast
}

/** A heading section in the parse tree, with its own blocks and its child sections. */
export interface SectionNode {
  /** The heading text, trimmed. Matching is exact and case-sensitive. */
  name: string
  /** The heading depth, 1 to 6. */
  depth: number
  /** The position of the heading. */
  pos: SourcePos
  /** The child sections, one heading level down. */
  sections: SectionNode[]
  /** The blocks directly under this heading, before its first child heading. */
  blocks: BlockNode[]
  /** The `^anchor` ids on the section itself. Ids bound to one block are on `BlockNode.anchor`. */
  anchors: string[]
}

/** One item of a list block. */
export interface ListItem {
  /** The item's text, with inline markup flattened. */
  text: string
  /** The checkbox state of a task list item; absent for an item without a checkbox. */
  checked?: boolean
  pos: SourcePos
}

/**
 * One block in the parse tree, by `kind`: a table, a list, a fenced code block or a paragraph.
 * `anchor` is the `^anchor` id bound to the block, if any. Read typed cell and item values with
 * `typed()` and `typedItem()`: the content plane fills them when a schema transforms a value.
 */
export type BlockNode =
  | {
      kind: 'table'
      /** The header cells. */
      columns: string[]
      /** The body rows, one string per cell, with inline markup flattened. */
      rows: string[][]
      /** The source position of body row `i` (0-based). */
      rowPos(i: number): SourcePos
      /** The source position, with column, of one cell's content. `row` and `col` are 0-based. */
      cellPos(row: number, col: number): SourcePos
      /** The inline code spans in one cell, in document order; `[]` when it has none. */
      inlineSpans(row: number, col: number): InlineSpan[]
      /**
       * The typed value of one cell, by row index and column name: the output of the cell
       * schema when it transforms the text, or `undefined` when no schema did.
       */
      typed(row: number, col: string): unknown | undefined
      /** @internal The content plane stores a cell's parsed value here. */
      setTyped(row: number, col: string, value: unknown): void
      anchor?: string
      pos: SourcePos
    }
  | {
      kind: 'list'
      ordered: boolean
      items: ListItem[]
      /**
       * The typed value of item `i`: the output of the `everyItem` schema when it transforms
       * the text, or `undefined` when no schema did.
       */
      typedItem(i: number): unknown | undefined
      /** @internal The content plane stores an item's parsed value here. */
      setTypedItem(i: number, value: unknown): void
      anchor?: string
      pos: SourcePos
    }
  | {
      kind: 'code'
      /** The info string's language, or `null` when the fence has none. */
      lang: string | null
      value: string
      anchor?: string
      pos: SourcePos
    }
  | {
      kind: 'paragraph'
      /** The paragraph's text, with inline markup flattened. */
      text: string
      anchor?: string
      pos: SourcePos
      /** The inline code spans in the paragraph, in document order; `[]` when it has none. */
      inlineSpans(): InlineSpan[]
    }

// ── Findings ────────────────────────────────────────────────────────────────────

/** The level of a finding. The contract sets it, not the caller; only `error` fails a document. */
export type FindingLevel = 'error' | 'warn' | 'report'

/**
 * A text edit a tool could apply to repair a finding. This package only carries it on
 * `Finding.fix`; it never applies one.
 *
 * @experimental The shape may change in a minor release.
 */
export interface TextEdit {
  range: { start: SourcePos; end: SourcePos }
  newText: string
}

/** One problem found in a document. */
export interface Finding {
  /** The id, as `area/name`, for example `structure/section-missing`. */
  id: string
  level: FindingLevel
  /** The document's path, as given in `ValidateCtx.path`. */
  path: string
  /** Where the problem is; absent for a finding about the whole document, such as a missing section. */
  pos?: SourcePos
  message: string
  /**
   * The nearest `description` the contract gives for the place the finding is about: the leaf,
   * then the section and its parents, then the body, then the contract. Absent when there is none.
   */
  hint?: string
  /** A described repair. It is only described: this package never edits documents. */
  fix?: { description: string; edit?: TextEdit }
}

// ── Contracts ───────────────────────────────────────────────────────────────────

/** The four block kinds a content leaf can require. */
export type BlockKind = 'table' | 'list' | 'code' | 'paragraph'

/**
 * A content leaf, the value `table()`, `list()`, `code()` and `maxWords()` return. It names the
 * block kind a section must hold and carries the leaf's options.
 *
 * `Row` and `Item` exist only in the type: the row a table leaf reads back as and the item a
 * list leaf reads back as. Both default to `unknown`.
 */
export interface LeafSpec<Row = unknown, Item = unknown> {
  kind: BlockKind
  /** The leaf's options, as passed to the builder. */
  config?: unknown
  /** Type only: the row a table leaf reads back as. Never set at run time. */
  readonly _row?: Row
  /** Type only: the item a list leaf reads back as. Never set at run time. */
  readonly _item?: Item
}

/** Options for one level of the body grammar: the order of sections and whether others may appear. */
export interface LevelOpts {
  /**
   * `strict`: the sections follow the grammar's order, and an undeclared section may sit only
   * where a `gap()` is. `recognized-relative`: the declared sections keep their relative order.
   * `none` (the default): any order.
   */
  order?: 'none' | 'recognized-relative' | 'strict'
  /** Whether sections the level does not declare may appear. Default `true`. */
  allowUnknown?: boolean
  /** Guidance for authors; findings at this level carry it as `hint`. */
  description?: string
}

/** Options for `section()`. */
export interface SectionOpts {
  /** Whether the section may be absent. `optional(section(...))` does the same. */
  optional?: boolean
  /** The block the section must hold: one leaf, or leaves bound by `^anchor` id. */
  content?: LeafSpec | Record<string, LeafSpec>
  /** The grammar of the section's child sections. */
  children?: SectionSeq
  /** Rules that run on this section. */
  rules?: Rule[]
  /** A `^anchor` id the section must carry, for example `"summary"`. */
  anchor?: string
  /**
   * Whether the heading may appear more than once at its level. The typed model then reads the
   * section back as an array, in document order.
   */
  repeatable?: boolean
  /** The fewest occurrences of a repeatable section; fewer gives `structure/repeat-count`. */
  min?: number
  /** The most occurrences of a repeatable section; more gives `structure/repeat-count`. */
  max?: number
  /** Guidance for authors; findings about this section carry it as `hint`. */
  description?: string
}

/**
 * One element of a level's grammar: the value `section()`, `optional()`, `oneOf()` or `gap()`
 * returns. Pass an ordered array of them to `sections()`.
 */
export type Spec = SectionSpec | OptionalSpec | OneOfSpec | GapSpec

/**
 * The value `section()` returns. `Names` holds the declared heading names, and `Value` the typed
 * value the section reads back as, so `sections()` can type the body.
 */
export interface SectionSpec<Value = unknown, Names extends readonly string[] = string[]> {
  readonly kind: 'section'
  /** The heading name, or its accepted spellings. */
  readonly names: Names
  readonly opts?: SectionOpts
  /** Type only: the value the section reads back as. Never set at run time. */
  readonly _value?: Value
}

/** The value `optional()` returns: the wrapped spec, which may be absent. */
export interface OptionalSpec {
  readonly kind: 'optional'
  readonly spec: Spec
}

/** The value `oneOf()` returns: exactly one of several headings at one position. */
export interface OneOfSpec {
  readonly kind: 'oneOf'
  readonly names: string[]
  readonly opts?: SectionOpts
}

/** The value `gap()` returns: a run of undeclared sections at one position. */
export interface GapSpec {
  readonly kind: 'gap'
  readonly min?: number
  readonly max?: number
}

/** The body grammar `sections()` returns. `B` is the typed body it reads back as. */
export interface SectionSeq<B = unknown> {
  readonly __brand: 'SectionSeq'
  readonly opts: LevelOpts
  readonly specs: readonly Spec[]
  /** Type only: the typed body. Never set at run time. */
  readonly _body?: B
}

/** What a rule receives: the document path and a factory for its findings. */
export interface Ctx {
  /** The document's path, as given in `ValidateCtx.path`. */
  path: string
  /** Makes a finding. The path is filled in; `level` defaults to `error`. */
  finding(f: { id: string; message: string; level?: FindingLevel; pos?: SourcePos }): Finding
}

/** A section rule, the value `rule()` returns. */
export interface Rule {
  readonly __brand: 'Rule'
  readonly id: string
  /** Runs on one section and returns its findings. */
  run(node: SectionNode, ctx: Ctx): Finding[]
}

/** A document rule, the value `docRule()` returns. */
export interface DocRule {
  readonly __brand: 'DocRule'
  readonly id: string
  /**
   * Runs on the typed model and the parse tree and returns its findings. The tree lets a rule
   * report an exact line, which the typed model does not carry for every block.
   */
  run(doc: Doc, ctx: Ctx, tree: DocTree): Finding[]
}

/** What `contract()` takes. Every part is optional. */
export interface ContractDef<F = unknown, B = unknown> {
  /** A Zod schema for the frontmatter. `F` is its output type. */
  frontmatter?: ZodType<F>
  /** The body grammar, from `sections()`. */
  body?: SectionSeq<B>
  /** Rules that see the whole document. */
  rules?: DocRule[]
  /** Guidance for authors; a finding with no nearer description carries it as `hint`. */
  description?: string
}

/** The context `validate()` and `read()` take. */
export interface ValidateCtx {
  /** The document's path. It goes into every finding; nothing is read from it. */
  path: string
}

/** A compiled contract for one document type, the value `contract()` returns. */
export interface Contract<F = unknown, B = unknown> {
  /**
   * Validates a document's source. Problems come back as findings.
   *
   * @throws {Error} Only where `parse()` does: frontmatter YAML that cannot be resolved.
   * @throws {SyntaxError} When a text check's `regex` is not a valid regular expression.
   */
  validate(source: string, ctx: ValidateCtx): ValidationResult<F, B>
  /** Validates a tree from `parse()`, so one parse can serve several contracts. */
  validate(tree: DocTree, ctx: ValidateCtx): ValidationResult<F, B>
  /**
   * Validates a document's source and returns its typed model.
   *
   * @throws {ContractError} When the document has an error-level finding.
   * @throws {Error} Where `parse()` does: frontmatter YAML that cannot be resolved.
   * @throws {SyntaxError} When a text check's `regex` is not a valid regular expression.
   */
  read(source: string, ctx: ValidateCtx): Doc<F, B>
}

/** What `validate()` returns. */
export interface ValidationResult<F = unknown, B = unknown> {
  /**
   * Every finding, sorted by line, then column, then plane (frontmatter, structure, content,
   * text, rules). A finding with no position sorts first.
   */
  findings: Finding[]
  /** The typed model, present only when no finding is an error. */
  doc?: Doc<F, B>
  /** The parse tree, always present. */
  tree: DocTree
}

// ── The typed model ─────────────────────────────────────────────────────────────

/** A table in the typed model. Iterating it yields its rows. */
export interface TableView<Row = Record<string, string>> extends Iterable<Row> {
  kind: 'table'
  columns: string[]
  /** The rows, keyed by column name. A cell with a transforming schema holds its output. */
  rows: Row[]
  rowCount: number
  pos: SourcePos
  /** The values of one column, in row order. */
  column<K extends keyof Row>(name: K): Row[K][]
  /** The first row the predicate accepts. */
  find(p: (row: Row, i: number) => boolean): Row | undefined
  /** The source position of row `i` (0-based). */
  rowPos(i: number): SourcePos
  /**
   * The source position, with column, of one cell: a row object from `rows` and a column name.
   * `{ line: 0 }` when the row or column is not found.
   */
  cellPos(row: Row, name: string): SourcePos
}

/**
 * A list in the typed model. Iterating it yields its items. `Item` is the raw `ListItem` unless
 * the list leaf's `everyItem` schema transforms the text, in which case it is that output.
 */
export interface ListView<Item = ListItem> extends Iterable<Item> {
  kind: 'list'
  ordered: boolean
  items: Item[]
  length: number
  pos: SourcePos
}

/** A fenced code block in the typed model. */
export interface CodeView {
  kind: 'code'
  /** The info string's language, or `null` when the fence has none. */
  lang: string | null
  value: string
  pos: SourcePos
}

/** A paragraph in the typed model. */
export interface ParagraphView {
  kind: 'paragraph'
  /** The paragraph's text, with inline markup flattened. */
  text: string
  pos: SourcePos
}

/** Any block in the typed model, by `kind`. */
export type BlockView = TableView | ListView | CodeView | ParagraphView

/**
 * The sections of one level in the typed model, as on `doc.body` and `SectionView.sections`.
 * A section is reached by its exact heading, by the camelCase form of the heading, or with
 * `section(name)`. A declared section whose only content is one table leaf reads back as that
 * `TableView`; `section(name)` always returns the `SectionView`. `unknown` and `section` are not
 * enumerable, so a level with no declared section deep-equals `{}`.
 */
export interface SectionGroup {
  /** The sections the grammar did not declare, in document order; `[]` when none. */
  unknown: SectionView[]
  /** The section with a heading, declared or not. */
  section(name: string): SectionView | undefined
  [key: string]:
    | SectionView
    | TableView<Record<string, string>>
    | SectionView[]
    | TableView<Record<string, string>>[]
    | ((name: string) => SectionView | undefined)
    | undefined
}

/**
 * A heading section in the typed model. A `content` record of `^anchor`-bound tables also
 * appears as fields named by anchor, for example `doc.body.decision.components`.
 *
 * `LI` is the list item type: `ListItem`, or the output of a transforming `everyItem` schema
 * when the section's only content is that list leaf.
 */
export interface SectionView<LI = ListItem> {
  name: string
  pos: SourcePos
  anchors: string[]
  /** The section's text: `"prose"` (the default) is its own paragraphs; `"all"` adds its children. */
  text(scope?: 'prose' | 'all'): string
  /** The section's table, when it has exactly one. */
  table?: TableView<Record<string, string>>
  tables: TableView<Record<string, string>>[]
  lists: ListView<LI>[]
  /** The block bound to a `^anchor` id in this section. */
  byAnchor(id: string): BlockView | undefined
  /** The child sections, accessed like `doc.body`. */
  sections: SectionGroup
  [key: string]:
    | string
    | SourcePos
    | string[]
    | TableView<Record<string, string>>
    | TableView<Record<string, string>>[]
    | ListView<LI>[]
    | SectionGroup
    | ((scope?: 'prose' | 'all') => string)
    | ((id: string) => BlockView | undefined)
    | undefined
}

/** The typed model of a document, as `read()` returns it and `validate()` returns it in `doc`. */
export type Doc<F = unknown, B = unknown> = {
  /** The frontmatter, as the contract's schema outputs it. */
  frontmatter: F
  /** The sections. */
  body: B
  /** The block bound to a `^anchor` id anywhere in the document. */
  byAnchor(id: string): BlockView | undefined
  /**
   * The inline code spans in one table cell, by a row object from a table's `rows` and a column
   * name, in whichever table holds the row. `[]` when the cell has none or the row is not found.
   */
  inlineSpans(row: Record<string, string>, col: string): InlineSpan[]
}

/** Merges a union into an intersection. */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

/**
 * The value a declared section reads back as in the typed model, given its `section()` options.
 * A section whose only content is a table leaf with transforming cells reads back as
 * `TableView<Row>`. One whose only content is a list leaf with a transforming `everyItem` reads
 * back as `SectionView<Item>`. Any other section reads back as `SectionView`. A repeatable
 * section reads back as an array of these.
 */
export type SectionValue<O> = O extends { repeatable: true }
  ? SectionValueBase<O>[]
  : SectionValueBase<O>

/** The value of one occurrence of a section; see `SectionValue`. */
type SectionValueBase<O> = O extends { content: infer Ct }
  ? Ct extends LeafSpec<infer Row, infer Item>
    ? unknown extends Item
      ? unknown extends Row
        ? SectionView
        : TableView<Row>
      : SectionView<Item>
    : SectionView
  : SectionView

/**
 * One spec's part of the typed body: each declared heading name keyed to its value. A spec whose
 * name is not a literal, and an `optional`, `oneOf` or `gap` spec, adds nothing; read those with
 * `section(name)`.
 */
type BodyEntry<Sp> =
  Sp extends SectionSpec<infer Value, infer Names>
    ? string extends Names[number]
      ? Record<never, never>
      : { [K in Names[number]]: Value }
    : Record<never, never>

/**
 * The typed body a `sections()` grammar reads back as: each declared section's heading keyed to
 * its value, plus `unknown` and `section(name)`.
 */
export type BodyOf<S extends readonly Spec[]> = UnionToIntersection<BodyEntry<S[number]>> & {
  unknown: SectionView[]
  section(name: string): SectionView | undefined
}

/**
 * A heading name or a list of names, as a tuple. Internal: the package entry points do not
 * export it.
 */
export type NamesTupleOf<Names extends string | readonly string[]> = Names extends readonly string[]
  ? Names
  : [Names]

/**
 * The typed model of a contract, for annotating a variable: `Infer<typeof myContract>`. The
 * frontmatter is the schema's output type. The body is the typed body from `sections()`, or
 * `SectionGroup` when the contract has no typed body.
 */
export type Infer<C> =
  C extends Contract<infer F, infer B>
    ? {
        frontmatter: F
        body: unknown extends B ? SectionGroup : B
        byAnchor(id: string): BlockView | undefined
        inlineSpans(row: Record<string, string>, col: string): InlineSpan[]
      }
    : never
