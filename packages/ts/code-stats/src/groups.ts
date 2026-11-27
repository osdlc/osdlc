import { compileGlobs, type Matcher } from './glob.ts'
import type { LinguistAttributes } from './types.ts'
import type { ContentKind } from './scan/kinds.ts'
import type { LanguageCategory } from './scan/overlay.ts'

/**
 * What a file is for. `generated` and `vendored` files are counted by lines
 * only: no one reviews or wrote them line by line. `instructions` are prompts
 * and agent instructions, Markdown whose lines act like code.
 */
export const FILE_GROUPS = [
  'source',
  'tests',
  'docs',
  'instructions',
  'other',
  'generated',
  'vendored',
] as const
/**
 * What a file is for, one of {@link FILE_GROUPS}.
 */
export type FileGroup = (typeof FILE_GROUPS)[number]

/**
 * The groups a caller's globs can put a file in, in the order they are tried.
 *
 * @experimental
 */
export const RULE_GROUPS = ['generated', 'vendored', 'instructions', 'docs', 'tests'] as const
/**
 * A group a caller's globs can put a file in, one of {@link RULE_GROUPS}.
 */
export type RuleGroup = (typeof RULE_GROUPS)[number]

/** Globs (picomatch, dotfiles included) that put a file in a group, ahead of every other rule. */
export type GroupRules = { readonly [G in RuleGroup]?: readonly string[] }

const LOCKFILES = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'deno.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'go.sum',
  'flake.lock',
  'mix.lock',
  'pubspec.lock',
  'Package.resolved',
  'packages.lock.json',
]

/**
 * The built-in globs, tried after the caller's and linguist's. Beside them, a
 * file whose first lines say `DO NOT EDIT` or `@generated` is generated.
 */
export const DEFAULT_RULES: { readonly [G in RuleGroup]: readonly string[] } = Object.freeze({
  generated: Object.freeze([
    `**/{${LOCKFILES.join(',')}}`,
    '**/*.min.{js,mjs,cjs,css}',
    '**/*.map',
    '**/_generated/**',
    '**/__generated__/**',
    '**/*.generated.*',
    '**/*.pb.go',
    '**/*_pb2.py',
    '**/*_pb2_grpc.py',
    '**/__snapshots__/**',
    '**/*.snap',
  ]),
  vendored: Object.freeze([
    '**/node_modules/**',
    '**/vendor/**',
    '**/third_party/**',
    '**/third-party/**',
    '**/bower_components/**',
  ]),
  instructions: Object.freeze([
    '**/SKILL.md',
    '**/CLAUDE.md',
    '**/AGENTS.md',
    '**/GEMINI.md',
    '**/*.prompt.md',
    '**/skills/**/*.md',
    '**/.claude/agents/**',
    '**/.claude/commands/**',
    '**/.cursor/rules/**',
    '**/.github/copilot-instructions.md',
    '**/.github/instructions/**',
  ]),
  docs: Object.freeze([]),
  tests: Object.freeze([
    '**/*.{test,spec}.*',
    '**/*_test.go',
    '**/test_*.py',
    '**/*_test.py',
    '**/{test,tests,__tests__}/**',
  ]),
})

/**
 * Text in a file's first {@link MARKER_LINES} lines that marks it generated:
 * Go's `Code generated … DO NOT EDIT.`, `@generated`.
 */
const GENERATED_MARKER = /@generated\b|\bDO NOT EDIT\b/
const MARKER_LINES = 5

function hasGeneratedMarker(text: string): boolean {
  return GENERATED_MARKER.test(text.split('\n', MARKER_LINES).join('\n'))
}

/** What is known about a file when its group is decided. */
export interface FileFacts {
  path: string
  category: LanguageCategory | null
  attributes?: LinguistAttributes | undefined
  /** The file's text, for the generated-file marker. */
  text?: string | undefined
}

/** One matcher per rule group over its globs; a group with none matches nothing. */
function matchersFor(rules: GroupRules): Record<RuleGroup, Matcher> {
  return Object.fromEntries(
    RULE_GROUPS.map((g) => [g, compileGlobs(rules[g] ?? [], { dot: true })]),
  ) as Record<RuleGroup, Matcher>
}

/**
 * Decides which {@link FileGroup} a file belongs to, from what is known about it.
 */
export type GroupClassifier = (file: FileFacts) => FileGroup

/**
 * Decides a file's group. First match wins: the caller's rules (generated,
 * vendored, instructions, docs, tests), then linguist attributes, then the
 * built-in generated, vendored and instructions rules, then prose as docs,
 * then the built-in test paths, then programming as source and the rest as
 * other. `linguist-generated=false` or `linguist-vendored=false` turns off
 * the built-in rule it names.
 */
export function createGroupClassifier(rules: GroupRules = {}): GroupClassifier {
  const own = matchersFor(rules)
  const builtin = matchersFor(DEFAULT_RULES)

  return ({ path, category, attributes, text }) => {
    const ruled = RULE_GROUPS.find((g) => own[g](path))
    if (ruled !== undefined) return ruled
    if (attributes?.generated === true) return 'generated'
    if (attributes?.vendored === true) return 'vendored'
    if (attributes?.documentation === true) return 'docs'
    if (attributes?.generated !== false) {
      if (builtin.generated(path)) return 'generated'
      if (text !== undefined && hasGeneratedMarker(text)) return 'generated'
    }
    if (attributes?.vendored !== false && builtin.vendored(path)) return 'vendored'
    if (builtin.instructions(path)) return 'instructions'
    if (category === 'prose') return 'docs'
    if (builtin.tests(path)) return 'tests'
    return category === 'programming' ? 'source' : 'other'
  }
}

/** Groups whose lines are counted but not classified. */
export function isUnreviewed(group: FileGroup): group is 'generated' | 'vendored' {
  return group === 'generated' || group === 'vendored'
}

/** An instruction file's prose acts as code, so its doc lines count as logic. */
export function kindInGroup(group: FileGroup, kind: ContentKind): ContentKind {
  return group === 'instructions' && kind === 'doc' ? 'logic' : kind
}
