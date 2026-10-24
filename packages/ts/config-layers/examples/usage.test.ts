/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 *
 * The tool is `tooly`: a project file `tooly.yaml`, an overlay
 * `tooly.local.yaml`, a machine file, and the variable prefix `TOOLY`.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'
import { z } from 'zod'

import {
  APPLY_PREFIX,
  applierAndReservedProblems,
  applierOf,
  assembleConfig,
  checkConfigMeta,
  closestMatches,
  CONFIG_INVALID_EXIT,
  ConfigInvalidError,
  ConfigKeyMetaSchema,
  configNeeds,
  CONSUMER_REF,
  consumerProblems,
  currentMachineVersion,
  deepMergeConfig,
  defaultOf,
  defineConfigSection,
  defineConfigVocabulary,
  DeprecationSchema,
  deprecatedKeysSet,
  deprecationMessage,
  describeShape,
  descriptionOf,
  didYouMean,
  enforcementProblems,
  envStem,
  envVars,
  substitutePathNames,
  getIn,
  isReserved,
  jsonSchemaOf,
  keyDescription,
  keyExists,
  leafSchema,
  MACHINE_CONFIG_ISSUE_CODES,
  machineConfigFile,
  machineLayerKeys,
  migrateMachineRaw,
  nestedFields,
  omitPath,
  overlayPath,
  PATH_NAME,
  pathMatcher,
  pathsSchema,
  pathNames,
  PLANNED_PREFIX,
  projectLayerIssues,
  readConfigMeta,
  readMappingFile,
  readParsedFile,
  RegisteredKeyMetaSchema,
  RELOADS_ON_CHANGE,
  renderReference,
  resolveConfigFile,
  resolveConfigPath,
  resolveKeyPath,
  resolveLayeredSteps,
  resolveLayeredValue,
  scaffoldLocalYaml,
  scaffoldYaml,
  ConsumerSchema,
  setPath,
  splitKeyPath,
  STABILITY_LEVELS,
  StabilitySchema,
  starterYaml,
  stripUnknownKeys,
  systemDirs,
  TieredDirs,
  PathNameError,
  topLevelKeys,
  unknownKeyMessage,
  unsetPath,
  valueAt,
  valueIsSet,
  type AppliesVia,
  type AssembleConfigOptions,
  type ConfigFileSpec,
  type ConfigHandle,
  type ConfigIssue,
  type ConfigLayers,
  type ConfigMetaIssue,
  type ConfigNeed,
  type ConfigNeeds,
  type ConfigNeedsOptions,
  type ConfigOf,
  type ConfigSection,
  type ConfigSectionHooks,
  type ConfigVocabulary,
  type ConfigVocabularySpec,
  type ConfigKeyMeta,
  type Deprecation,
  type DeprecatedKeyUse,
  type EnvVars,
  type SubstituteOptions,
  type KeyScopes,
  type LayerCheckContext,
  type StrippedKeys,
  type UnknownKeyUse,
  type MachineConfigFile,
  type MachineConfigFileOptions,
  type MachineConfigIssue,
  type MachineConfigLoad,
  type MachineMigrateResult,
  type MachineMigration,
  type MessageOptions,
  type MetaTerms,
  type MetaValidator,
  type MetOptions,
  type NestedField,
  type ParsedFileRead,
  type PathsSchemaOptions,
  type PathNames,
  type RawLayer,
  type RawLayeredSteps,
  type ReadMappingOptions,
  type ReferenceOptions,
  type RegisteredKeyMeta,
  type ResolveConfigFileOptions,
  type ResolvedConfigFile,
  type ResolvedKey,
  type ResolvedLayeredSteps,
  type ResolvedLayeredValue,
  type ResolvedStep,
  type ResolveKeyPathOptions,
  type ResolveLayeredStepsOptions,
  type ResolveLayeredValueOptions,
  type ScaffoldOptions,
  type Stability,
  type StarterOptions,
  type StepMode,
  type StepProvenance,
  type ResolveConfigPathOptions,
  type ResolveOptions,
  type TermsOf,
  type ValueLayer,
  type VendorDirs,
} from '@osdlc/config-layers'

// ---------------------------------------------------------------------------
// The tool: a vocabulary, its sections, and the machine schema.
// ---------------------------------------------------------------------------

const PROJECT_FILE = 'tooly.yaml'
const LOCAL_FILE = 'tooly.local.yaml'
const FILE_SPEC: ConfigFileSpec = { name: PROJECT_FILE, envVar: 'TOOLY_CONFIG' }
const VENDOR: VendorDirs = { vendor: 'com.example', envVars: envVars('TOOLY') }

const vocabulary: ConfigVocabulary<
  'core' | 'extras',
  'shims',
  'project' | 'local' | 'machine',
  'cli',
  'strict' | 'applied' | 'reserved'
> = defineConfigVocabulary({
  categories: ['core', 'extras'],
  appliers: ['shims'],
  layers: ['project', 'local', 'machine'],
  runContexts: ['cli'],
  enforcement: {
    levels: ['strict', 'applied', 'reserved'],
    reserved: 'reserved',
    applied: 'applied',
  },
})

type ToolyTerms = TermsOf<
  'core' | 'extras',
  'shims',
  'project' | 'local' | 'machine',
  'cli',
  'strict' | 'applied' | 'reserved'
>

/** A key people may set in the project file and the overlay, read at run time. */
const readMeta: ConfigKeyMeta<ToolyTerms> = {
  category: 'core',
  consumers: ['authority.ts#authority'],
  layers: ['project', 'local'],
  applies_via: 'read',
  enforcement: 'strict',
  runs_in: ['cli'],
}

/** Rules the layers can break that the schema cannot see. */
function layoutProblems(ctx: LayerCheckContext<{ layout: string }>): ConfigIssue[] {
  if (ctx.value === undefined || ctx.value.layout.includes('{repo}')) return []
  return [{ path: 'checkout.layout', message: 'the layout must contain {repo}' }]
}

const CheckoutSchema = z
  .object({ layout: z.string().default('{dev}/{repo}').describe('Where a checkout lands.') })
  .strict()
  .prefault({})
  .describe('Checkout settings.')
const checkoutHooks: ConfigSectionHooks<typeof CheckoutSchema> = { layerCheck: layoutProblems }

const authority = vocabulary.defineSection({
  key: 'authority',
  schema: z.string().default('').describe('The remote server the tool talks to. Empty means none.'),
  meta: readMeta,
})
const checkout = vocabulary.defineSection({
  key: 'checkout',
  schema: CheckoutSchema,
  meta: readMeta,
  ...checkoutHooks,
})
const paths = vocabulary.defineSection({
  key: 'paths',
  schema: pathsSchema({ reserved: ['repo'] })
    .default({})
    .describe('Named directories.'),
  meta: { ...readMeta, layers: ['project', 'local', 'machine'] },
})
const shims = vocabulary.defineSection({
  key: 'shims',
  schema: z
    .object({ enabled: z.boolean().default(false).describe('Install shell shims.') })
    .strict()
    .prefault({})
    .describe('Shell shims.'),
  meta: { ...readMeta, applies_via: 'apply:shims', enforcement: 'applied' },
})
const telemetry = vocabulary.defineSection({
  key: 'telemetry',
  schema: z.object({}).strict().optional().describe('Reserved: nothing reads it yet.'),
  meta: { ...readMeta, consumers: ['planned:telemetry reader'], enforcement: 'reserved' },
})
const legacy = vocabulary.defineSection({
  key: 'legacy',
  schema: z.string().optional().describe('Replaced by `authority`.'),
  meta: {
    ...readMeta,
    deprecation: { since: '1.2.0', removeIn: '2.0.0', use: 'authority' },
  },
})
const token = vocabulary.defineSection({
  key: 'token',
  schema: z.string().optional().describe('An API token.'),
  meta: { ...readMeta, layers: ['local'], secret: true },
})
// A section can also be defined without a vocabulary: its terms are plain strings.
const workflows = defineConfigSection({
  key: 'workflows',
  schema: z.record(z.string(), z.array(z.string())).default({}).describe('Named command lists.'),
  meta: { ...readMeta, category: 'extras' },
})

const SECTIONS = [authority, checkout, paths, shims, telemetry, legacy, token, workflows] as const
const mounted: readonly ConfigSection[] = SECTIONS
const shape: Record<string, z.ZodType> = Object.fromEntries(mounted.map((s) => [s.key, s.schema]))
const ProjectSchema = z.object(shape)

const MachineSchema = z
  .object({
    repos: z.array(z.string()).default([]).describe('Directories that hold checkouts.'),
    paths: z.record(z.string(), z.string()).default({}).describe('Named directories here.'),
    trust: z
      .object({ owners: z.array(z.string()).default([]) })
      .strict()
      .prefault({}),
  })
  .strict()

// ---------------------------------------------------------------------------
// A scratch machine: temp dirs, an injected home, an injected environment.
// ---------------------------------------------------------------------------

let root: string
let home: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'config-layers-example-')))
  home = join(root, 'home')
  mkdirSync(home, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function project(name = 'repo'): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function write(dir: string, file: string, text: string): string {
  const path = join(dir, file)
  writeFileSync(path, text)
  return path
}

/** Parse YAML text with the package's own reader. */
function parseYaml(text: string): unknown {
  const file = join(root, 'parse.yaml')
  writeFileSync(file, text)
  const read = readParsedFile(file)
  if (read.kind !== 'ok') throw new Error(`could not parse: ${read.kind}`)
  return read.value
}

function toolyConfig(
  unknownTopLevel: 'reject' | 'ignore' | 'warn' = 'reject',
): ConfigHandle<typeof SECTIONS> {
  const options: AssembleConfigOptions<typeof SECTIONS> = {
    file: FILE_SPEC,
    sections: SECTIONS,
    unknownTopLevel,
    label: 'tooly config',
    resolve: { env: {}, cwd: root },
  }
  return assembleConfig(options)
}

function machineFile(
  extra: Partial<MachineConfigFileOptions<typeof MachineSchema>> = {},
): MachineConfigFile<typeof MachineSchema> {
  const dirs = systemDirs(VENDOR, { home, env: {} })
  return machineConfigFile({
    tool: 'tooly',
    schema: MachineSchema,
    vendorDirs: VENDOR,
    dirs: () => dirs,
    ...extra,
  })
}

// ---------------------------------------------------------------------------
// Names, values, merging
// ---------------------------------------------------------------------------

test('suggest a close name for a mistyped command', () => {
  const verbs = ['list', 'upload', 'config', 'checkout']
  expect(closestMatches('lst', verbs)).toEqual(['list'])
  expect(closestMatches('confg', verbs, { max: 1 })).toEqual(['config'])
  expect(didYouMean('chekout', verbs)).toBe('did you mean: checkout?')
  expect(didYouMean('zzzzzz', verbs)).toBeNull()
})

test('find the tool directories under a home that is not the real one', () => {
  const options: ResolveOptions = { home, env: {} }
  const dirs = systemDirs(VENDOR, options)
  const config = dirs.standalone('tooly').config().path
  expect(config.startsWith(home)).toBe(true)
  expect(config).toContain('tooly')

  // The override variables the tool ships move the directories.
  const vars: EnvVars = envVars('TOOLY')
  expect(vars.root).toBe('TOOLY_ROOT')
  const rooted = systemDirs(VENDOR, { home, env: { [vars.root]: join(root, 'stub') } })
  expect(rooted.standalone('tooly').config().path.startsWith(join(root, 'stub'))).toBe(true)

  // Roots can also be handed in directly.
  const base = join(root, 'direct')
  const direct = new TieredDirs('com.example', {
    durable: join(base, 'durable'),
    config: join(base, 'config'),
    cache: join(base, 'cache'),
    state: join(base, 'state'),
    logs: join(base, 'logs'),
    runtime: join(base, 'runtime'),
    scratch: join(base, 'scratch'),
  })
  expect(direct.standalone('tooly').config().path.startsWith(join(base, 'config'))).toBe(true)
})

test('read a setting by dotted key and tell whether it counts as set', () => {
  const config = { authority: '', paths: { dev: '~/dev' }, repos: [], checkout: { layout: 'x' } }
  expect(valueAt(config, 'paths.dev')).toBe('~/dev')
  expect(valueAt(config, 'paths.nope.deeper')).toBeUndefined()
  expect(valueIsSet(valueAt(config, 'authority'))).toBe(false)
  expect(valueIsSet(valueAt(config, 'repos'))).toBe(false)
  expect(valueIsSet(valueAt(config, 'paths'))).toBe(true)
  expect(valueIsSet(0)).toBe(true)
})

test('layer the local overlay over the project file', () => {
  const base = { checkout: { layout: '{dev}/{repo}', depth: 1 }, repos: ['a'] }
  const overlay = { checkout: { layout: '{dev}/x/{repo}' }, repos: ['b'] }
  expect(deepMergeConfig(base, overlay)).toEqual({
    checkout: { layout: '{dev}/x/{repo}', depth: 1 },
    repos: ['b'],
  })
  expect(base.repos).toEqual(['a'])

  // The one list that merges is `schedules`, by entry name.
  const merged = deepMergeConfig(
    {
      schedules: [
        { name: 'nightly', at: '01:00' },
        { name: 'weekly', at: 'mon' },
      ],
    },
    { schedules: [{ name: 'nightly', at: '03:00' }] },
  )
  expect(merged['schedules']).toEqual([
    { name: 'weekly', at: 'mon' },
    { name: 'nightly', at: '03:00' },
  ])
})

// ---------------------------------------------------------------------------
// Finding and reading the files
// ---------------------------------------------------------------------------

test('find the project file and its overlay, or the file a variable names', () => {
  expect(overlayPath('/work/tools/tooly.yaml')).toBe('/work/tools/tooly.local.yaml')
  expect(overlayPath('cfg.yml')).toBe('cfg.local.yml')

  const dir = project()
  const found: ResolvedConfigFile = resolveConfigFile(dir, { ...FILE_SPEC, env: {} })
  expect(found).toEqual({
    project: join(dir, PROJECT_FILE),
    local: join(dir, LOCAL_FILE),
    source: 'default',
  })

  const elsewhere = write(root, 'shared.yaml', 'authority: example\n')
  const options: ResolveConfigFileOptions = { ...FILE_SPEC, env: { TOOLY_CONFIG: elsewhere } }
  const relocated = resolveConfigFile(dir, options)
  expect(relocated).toEqual({
    project: elsewhere,
    local: join(root, 'shared.local.yaml'),
    source: 'env',
  })

  // A variable that names a missing file is an error, not a silent default.
  const missing = { ...FILE_SPEC, env: { TOOLY_CONFIG: join(root, 'gone.yaml') } }
  expect(() => resolveConfigFile(dir, missing)).toThrow(ConfigInvalidError)
  // A subtree always resolves to its own pair.
  expect(resolveConfigFile(dir, { ...missing, scope: 'subtree' }).source).toBe('default')
})

test('a broken config file stops the command with exit code 14', () => {
  const dir = project()
  write(dir, PROJECT_FILE, 'bogus: 1\n')
  let caught: unknown
  try {
    toolyConfig().load(dir)
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(ConfigInvalidError)
  const error = caught as ConfigInvalidError
  expect(error.exitCode).toBe(CONFIG_INVALID_EXIT)
  expect(CONFIG_INVALID_EXIT).toBe(14)
  expect(error.files).toEqual([join(dir, PROJECT_FILE)])
  expect(error.message).toContain('not valid tooly config')
  expect(error.message).toContain('bogus')

  const issue: ConfigIssue = error.issues[0]!
  expect(issue.message).toContain('bogus')

  // A standalone tool that mounts a few sections ignores keys it does not own.
  expect(toolyConfig('ignore').load(dir).authority).toBe('')
})

test('read raw files without deciding what they must contain', () => {
  const dir = project()
  const good = write(dir, 'a.yaml', 'authority: example\n')
  const list = write(dir, 'b.yaml', '- one\n- two\n')
  const broken = write(dir, 'c.yaml', 'a: [unclosed\n')
  const json = write(dir, 'd.json', '{"authority": "example"}')

  const ok: ParsedFileRead = readParsedFile(good)
  expect(ok).toEqual({ kind: 'ok', path: good, value: { authority: 'example' } })
  expect(readParsedFile(join(dir, 'none.yaml')).kind).toBe('absent')
  expect(readParsedFile(broken).kind).toBe('unparsable')
  expect(readParsedFile(json, 'json')).toMatchObject({
    kind: 'ok',
    value: { authority: 'example' },
  })

  const layer: RawLayer = readMappingFile(good)
  expect(layer).toEqual({ path: good, exists: true, data: { authority: 'example' }, problem: null })
  expect(readMappingFile(list).problem).toBe('top level must be a mapping')
  expect(readMappingFile(join(dir, 'none.yaml'))).toMatchObject({ exists: false, data: null })

  const options: ReadMappingOptions = { parseProblem: (m) => `tooly.yaml is not YAML: ${m}` }
  expect(readMappingFile(broken, options).problem).toMatch(/^tooly\.yaml is not YAML: /)
  expect(readMappingFile(json, { format: 'json' }).data).toEqual({ authority: 'example' })
})

// ---------------------------------------------------------------------------
// Sections, the loader, deprecation
// ---------------------------------------------------------------------------

test('load the project file with its overlay and every default filled', () => {
  expect(RELOADS_ON_CHANGE).toBe(true)
  const dir = project()
  const handle = toolyConfig()

  const defaults: ConfigOf<typeof SECTIONS> = handle.load(dir)
  expect(defaults.authority).toBe('')
  expect(defaults.checkout.layout).toBe('{dev}/{repo}')

  write(dir, PROJECT_FILE, 'authority: origin\ncheckout:\n  layout: "{dev}/a/{repo}"\n')
  write(dir, LOCAL_FILE, 'checkout:\n  layout: "{dev}/b/{repo}"\n')
  handle.clearCache()
  const layers: ConfigLayers<ConfigOf<typeof SECTIONS>> = handle.loadLayers(dir)
  expect(layers.merged.authority).toBe('origin')
  expect(layers.merged.checkout.layout).toBe('{dev}/b/{repo}')
  expect(layers.project).toEqual({ authority: 'origin', checkout: { layout: '{dev}/a/{repo}' } })
  expect(layers.local).toEqual({ checkout: { layout: '{dev}/b/{repo}' } })
  expect(layers.files.source).toBe('default')

  // The raw read does no validation, so it works on a file that load refuses.
  write(dir, PROJECT_FILE, 'authority: 7\n')
  expect(() => handle.load(dir)).toThrow(ConfigInvalidError)
  expect(handle.readLayers(dir).project).toEqual({ authority: 7 })
  expect(Object.keys(handle.schema.shape)).toContain('workflows')
  expect(Object.keys(handle.fileSchema.shape)).toEqual(Object.keys(handle.schema.shape))
})

test('a section can refuse what only the layers can see', () => {
  const dir = project()
  const handle = toolyConfig()

  // The section hook sees the merged value.
  write(dir, PROJECT_FILE, 'checkout:\n  layout: fixed\n')
  expect(() => handle.load(dir)).toThrow('the layout must contain {repo}')

  // A key whose meta leaves out the project layer cannot come from the committed file.
  write(dir, PROJECT_FILE, 'token: abc\n')
  expect(() => handle.load(dir)).toThrow(ConfigInvalidError)
  const issues = projectLayerIssues(SECTIONS, dir, { token: 'abc' })
  expect(issues.some((i) => i.path === 'token')).toBe(true)
  expect(projectLayerIssues(SECTIONS, dir, { authority: 'origin' })).toEqual([])
  expect(projectLayerIssues(SECTIONS, dir, null)).toEqual([])

  // The overlay may carry it.
  write(dir, PROJECT_FILE, '')
  write(dir, LOCAL_FILE, 'token: abc\n')
  expect(handle.load(dir).token).toBe('abc')
})

test('a host that mounts every section can drop unknown keys and say which', () => {
  const dir = project()
  const handle = toolyConfig('warn')

  // An unknown key at any depth is removed from the parsed copy and reported.
  // The file on disk is left as it was.
  write(dir, PROJECT_FILE, 'authority: origin\nstranger: 1\ncheckout:\n  surprise: true\n')
  const layers = handle.loadLayers(dir)
  expect(layers.merged.authority).toBe('origin')
  const used: UnknownKeyUse[] = layers.unknownKeys
  expect(used.map((u) => u.path)).toEqual(['checkout.surprise', 'stranger'])
  expect(unknownKeyMessage(join(dir, PROJECT_FILE), 'stranger')).toContain(
    `${PROJECT_FILE}: unknown key stranger ignored`,
  )

  // The loader uses `stripUnknownKeys`: a strict schema and an input give a copy without the keys.
  const stripped: StrippedKeys = stripUnknownKeys(z.object({ a: z.string() }).strict(), {
    a: 'x',
    b: 1,
  })
  expect(stripped.value).toEqual({ a: 'x' })
  expect(stripped.unknown).toEqual([['b']])

  // `pathMatcher` matches the objects where a dropped key would widen the match. Those still fail.
  const strict = pathMatcher(['checkout'])
  expect(strict(['checkout'])).toBe(true)
  expect(strict(['authority'])).toBe(false)
})

test('warn once about a deprecated key, but keep loading', () => {
  const deprecated: Deprecation = { since: '1.2.0', removeIn: '2.0.0', use: 'authority' }
  expect(DeprecationSchema.parse(deprecated)).toEqual(deprecated)
  expect(deprecationMessage('tooly.yaml key legacy', deprecated)).toBe(
    'warning: tooly.yaml key legacy is deprecated since 1.2.0 and will be removed in 2.0.0; use authority instead',
  )

  const uses: DeprecatedKeyUse[] = deprecatedKeysSet(SECTIONS, [null, { legacy: 'x' }])
  expect(uses).toEqual([{ key: 'legacy', deprecated, layer: 1 }])
  expect(deprecatedKeysSet(SECTIONS, [{ authority: 'origin' }])).toEqual([])

  const dir = project()
  write(dir, LOCAL_FILE, 'legacy: old\n')
  const handle = toolyConfig()
  const seen: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: string | Uint8Array) => {
    seen.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  try {
    expect(handle.load(dir).legacy).toBe('old')
    handle.load(dir)
  } finally {
    process.stderr.write = original
  }
  expect(seen).toEqual([
    "warning: tooly.local.yaml key 'legacy' is deprecated since 1.2.0 and will be removed in 2.0.0; use authority instead\n",
  ])
})

// ---------------------------------------------------------------------------
// Editing and projecting
// ---------------------------------------------------------------------------

test('edit one key of a config file without disturbing the rest', () => {
  const text = '# tooly\nauthority: origin\n\ncheckout:\n  # where\n  layout: a # note\n'
  const set = setPath(text, ['checkout', 'layout'], '{dev}/{repo}')
  expect(set).toContain('# tooly')
  expect(set).toContain('# where')
  expect(parseYaml(set)).toEqual({ authority: 'origin', checkout: { layout: '{dev}/{repo}' } })

  expect(parseYaml(setPath(set, ['paths', 'dev'], '~/dev'))).toMatchObject({
    paths: { dev: '~/dev' },
  })
  expect(unsetPath(text, ['authority'])).not.toContain('authority')
  expect(unsetPath(text, ['nothing', 'here'])).toBe(text)
  expect(parseYaml(unsetPath(text, ['checkout', 'layout']))).toEqual({ authority: 'origin' })
  expect(() => setPath(text, [], 'x')).toThrow('invalid key path')
})

test('scaffold a fully annotated file, an overlay template and a starter', () => {
  const header = ['# tooly.yaml', '# Run `tooly config scaffold` to regenerate.']
  const options: ScaffoldOptions = {
    extraCommentsByKey: { authority: ['see also: the remote'], 'workflows.check': ['just ci'] },
    recordNotes: { workflows: ['# each entry is a list of commands'] },
  }
  const full = scaffoldYaml(ProjectSchema, header, options)
  expect(full).toContain('# The remote server the tool talks to. Empty means none.')
  expect(full).toContain('# see also: the remote')
  expect(full).toContain('#   check: detected')
  expect(full).toContain('# each entry is a list of commands')
  // Written out, the scaffold changes nothing: it parses to the defaults. Optional keys stay commented out.
  expect(parseYaml(full)).toEqual({
    authority: '',
    checkout: { layout: '{dev}/{repo}' },
    paths: {},
    shims: { enabled: false },
    workflows: {},
  })

  const overlay = scaffoldLocalYaml(ProjectSchema, ['# tooly.local.yaml'])
  expect(overlay).toContain('# authority:')
  expect(parseYaml(overlay)).toBeNull()

  const starterOptions: StarterOptions = {
    header: ['# tooly.yaml'],
    categories: ['core', 'extras'],
    live: { workflows: { check: ['just ci', 'just lint'], empty: [] } },
    scaffold: options,
  }
  const starter = starterYaml(ProjectSchema, starterOptions)
  expect(starter).toContain('# ── core')
  expect(starter).toContain('# ── extras')
  expect(parseYaml(starter)).toEqual({ workflows: { check: ['just ci', 'just lint'] } })
})

test('render the config reference page', () => {
  const options: ReferenceOptions = {
    categories: ['core', 'extras'],
    preamble: ['# tooly.yaml reference'],
    enforcementDoc: 'enforcement.md',
  }
  const page = renderReference(shape, options)
  expect(page.startsWith('# tooly.yaml reference\n')).toBe(true)
  expect(page).toContain('## Keys')
  expect(page).toContain('### authority')
  expect(page).toContain('(reserved)')
  expect(page).toContain('Deprecated | since 1.2.0, removed in 2.0.0; use `authority`')
  expect(page).toContain('see [the enforcement table](enforcement.md)')

  expect(() => renderReference(shape, { ...options, categories: ['core'] })).toThrow(
    'not in the list',
  )
})

// ---------------------------------------------------------------------------
// Meta and the vocabulary
// ---------------------------------------------------------------------------

test('check every key meta against the tool vocabulary', () => {
  expect(APPLY_PREFIX).toBe('apply:')
  expect(PLANNED_PREFIX).toBe('planned:')
  expect(STABILITY_LEVELS).toEqual(['stable', 'experimental'])
  const stability: Stability = StabilitySchema.parse('experimental')
  expect(stability).toBe('experimental')

  expect(CONSUMER_REF.test('authority.ts#authority')).toBe(true)
  expect(ConsumerSchema.safeParse('planned:later').success).toBe(true)
  expect(ConsumerSchema.safeParse('not a reference').success).toBe(false)

  expect(vocabulary.checkMeta(shape)).toEqual([])
  const validator: MetaValidator<ToolyTerms> = vocabulary
  expect(checkConfigMeta(shape, validator)).toEqual([])
  expect(checkConfigMeta(shape)).toEqual([])

  // A key without meta, and a term outside the vocabulary, are reported.
  const bad: Record<string, z.ZodType> = {
    bare: z.string(),
    odd: z.string().meta({ ...readMeta, category: 'misc', description: 'Odd.' }),
  }
  const issues: ConfigMetaIssue[] = vocabulary.checkMeta(bad)
  expect(issues.map((i) => i.key)).toEqual(['bare', 'odd'])
  expect(() => vocabulary.readMeta(bad)).toThrow('config key meta is incomplete')
  expect(() => readConfigMeta(bad)).toThrow('bare')
})

test('read the meta of a key and what it says about the key', () => {
  const metas = readConfigMeta(shape)
  const meta: RegisteredKeyMeta = metas['authority']!
  expect(meta.description).toBe('The remote server the tool talks to. Empty means none.')
  expect(RegisteredKeyMetaSchema.safeParse(meta).success).toBe(true)
  expect(vocabulary.readMeta(shape)['shims']!.enforcement).toBe('applied')
  expect(topLevelKeys(shape)['workflows']!.category).toBe('extras')

  const via: AppliesVia<'shims'> = 'apply:shims'
  expect(applierOf({ applies_via: via })).toBe('shims')
  expect(applierOf({ applies_via: 'read' })).toBeNull()
  expect(applierOf(metas['shims'] as RegisteredKeyMeta<ToolyTerms>)).toBe('shims')

  expect(isReserved(metas['telemetry']!)).toBe(true)
  expect(isReserved(metas['authority']!)).toBe(false)

  const terms: MetaTerms = { category: '', applier: '', layer: '', runContext: '', enforcement: '' }
  expect(Object.keys(terms)).toHaveLength(5)
  expect(ConfigKeyMetaSchema.safeParse(readMeta).success).toBe(true)
  expect(ConfigKeyMetaSchema.safeParse({ ...readMeta, extra: 1 }).success).toBe(false)
  expect(vocabulary.KeyMetaSchema.safeParse({ ...readMeta, category: 'misc' }).success).toBe(false)
  expect(vocabulary.AppliesViaSchema.safeParse('apply:other').success).toBe(false)
  expect(vocabulary.CategorySchema.options).toEqual(['core', 'extras'])
  expect(vocabulary.ApplierSchema.options).toEqual(['shims'])
  expect(vocabulary.LayerSchema.options).toContain('machine')
  expect(vocabulary.RunContextSchema.options).toEqual(['cli'])
  expect(vocabulary.EnforcementSchema.options).toHaveLength(3)
  expect(vocabulary.RegisteredKeyMetaSchema.safeParse(meta).success).toBe(true)
})

test('refuse a vocabulary that is incomplete', () => {
  const spec: ConfigVocabularySpec<
    'core',
    'none',
    'project' | 'local' | 'machine',
    'cli',
    'strict'
  > = {
    categories: ['core'],
    appliers: [],
    layers: ['project', 'local', 'machine'],
    runContexts: ['cli'],
    enforcement: { levels: ['strict'] },
  }
  const plain = defineConfigVocabulary(spec)
  // With no appliers, only `read` is a valid `applies_via`.
  expect(plain.AppliesViaSchema.safeParse('read').success).toBe(true)
  expect(plain.AppliesViaSchema.safeParse('apply:shims').success).toBe(false)

  expect(() => defineConfigVocabulary({ ...spec, layers: ['project', 'local'] as never })).toThrow(
    "layers must include 'machine'",
  )
  expect(() => defineConfigVocabulary({ ...spec, categories: ['core', 'core'] as never })).toThrow(
    "lists 'core' twice",
  )
})

test('prove the meta claims against the code', () => {
  const sourceRoot = join(root, 'src')
  mkdirSync(sourceRoot)
  write(sourceRoot, 'authority.ts', 'export const authority = readSetting("authority")\n')
  expect(consumerProblems(shape, sourceRoot)).toEqual([])
  rmSync(join(sourceRoot, 'authority.ts'))
  expect(consumerProblems(shape, sourceRoot)[0]).toContain('no such file')
  write(sourceRoot, 'authority.ts', 'export const other = 1\n')
  expect(consumerProblems(shape, sourceRoot)[0]).toContain('symbol not in file')

  const { reserved, applied } = vocabulary.spec.enforcement
  expect(enforcementProblems(shape, { reserved, applied })).toEqual([])
  expect(enforcementProblems(shape, { reserved: 'strict' })).not.toEqual([])

  const machineShape = MachineSchema.shape
  expect(machineLayerKeys(shape, machineShape)).toEqual({ claimed: ['paths'], declared: ['paths'] })

  // `shims` is used by a key; `hooks` is not. The reserved key is optional, as it must be.
  expect(applierAndReservedProblems(shape, vocabulary.spec.appliers)).toEqual([])
  expect(applierAndReservedProblems(shape, ['shims', 'hooks'])).toEqual([
    "applier 'hooks' is declared but no key uses it",
  ])
  expect(applierAndReservedProblems(shape, ['shims', 'hooks'], ['hooks'])).toEqual([])
})

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

test('name directories once and refer to them as {name}', () => {
  const baseDir = project()
  expect(PATH_NAME.test('dev_root')).toBe(true)
  expect(PATH_NAME.test('9dev')).toBe(false)

  expect(resolveConfigPath('https://example.com/x', baseDir)).toBe('https://example.com/x')
  expect(resolveConfigPath('word', baseDir)).toBe('word')
  expect(resolveConfigPath('./sub', baseDir)).toBe(join(baseDir, 'sub'))
  expect(resolveConfigPath('/abs/dir', baseDir)).toBe('/abs/dir')
  // `~` expands to the home you pass, not the real one.
  const homeOption: ResolveConfigPathOptions = { home }
  expect(resolveConfigPath('~/dev', baseDir, homeOption)).toBe(join(home, 'dev'))

  // The machine's entry wins over the project's, per name.
  const names: PathNames = pathNames(
    baseDir,
    { dev: '/machine/dev' },
    { dev: './dev', docs: './docs' },
  )
  expect(names).toEqual({ dev: '/machine/dev', docs: join(baseDir, 'docs') })

  expect(substitutePathNames('{dev}/tooly', names, 'repos:')).toBe('/machine/dev/tooly')
  const options: SubstituteOptions = { defineHint: 'define it in tooly.yaml or the machine config' }
  let caught: unknown
  try {
    substitutePathNames('{nope}/x', names, 'repos:', options)
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(PathNameError)
  expect((caught as PathNameError).message).toContain(
    "unknown path name '{nope}' in repos: '{nope}/x'",
  )
  expect((caught as PathNameError).message).toContain('define it in tooly.yaml')
  expect((caught as PathNameError).message).toContain('available: {dev}, {docs}')

  const schemaOptions: PathsSchemaOptions = { reserved: ['repo', 'owner'] }
  const schema = pathsSchema(schemaOptions)
  expect(schema.safeParse({ dev: '~/dev' }).success).toBe(true)
  expect(schema.safeParse({ repo: '~/dev' }).success).toBe(false)
  expect(schema.safeParse({ '1bad': '~/dev' }).success).toBe(false)
  expect(schema.safeParse({ dev: '  ' }).success).toBe(false)
})

// ---------------------------------------------------------------------------
// Looking inside a schema
// ---------------------------------------------------------------------------

test('look up a key in a schema and quote its description', () => {
  const schema = z.object({
    authority: ProjectSchema.shape['authority']!,
    checkout: ProjectSchema.shape['checkout']!,
    paths: ProjectSchema.shape['paths']!,
    protocol: z.enum(['https', 'ssh']).optional(),
  })
  expect(keyExists(schema, 'checkout.layout')).toBe(true)
  expect(keyExists(schema, 'checkout.nope')).toBe(false)
  // A key under a record resolves to the record.
  expect(keyExists(schema, 'paths.dev')).toBe(true)
  expect(leafSchema(schema, 'checkout.layout')).not.toBeNull()
  expect(leafSchema(schema, 'nope')).toBeNull()
  expect(keyDescription(schema, 'authority')).toBe('The remote server the tool talks to.')
  expect(keyDescription(schema, 'protocol')).toBeNull()
})

test('explain a dotted key the way a config command would', () => {
  expect(splitKeyPath('checkout.layout')).toEqual(['checkout', 'layout'])
  expect(() => splitKeyPath('checkout..layout')).toThrow('invalid key path')

  const options: ResolveKeyPathOptions = { file: PROJECT_FILE }
  const key: ResolvedKey = resolveKeyPath(shape, ['checkout', 'layout'], options)
  expect(key.section).toBe('checkout')
  expect(key.description).toBe('Where a checkout lands.')
  expect(key.meta.category).toBe('core')
  expect(defaultOf(key.schema)).toBe('{dev}/{repo}')
  expect(descriptionOf(key.schema)).toBe('Where a checkout lands.')
  // A record's values resolve through any name.
  expect(resolveKeyPath(shape, ['workflows', 'check']).section).toBe('workflows')

  expect(() => resolveKeyPath(shape, ['chekout'], options)).toThrow(
    "unknown tooly.yaml key 'chekout'; did you mean: checkout?",
  )
  expect(() => resolveKeyPath(shape, ['checkout', 'layot'])).toThrow(
    'did you mean: checkout.layout?',
  )
  expect(() => resolveKeyPath(shape, ['authority', 'x'])).toThrow('is not a mapping')
  expect(resolveKeyPath(shape, ['authority'], { vocabulary }).meta.enforcement).toBe('strict')

  const fields: NestedField[] = nestedFields(shape['checkout']!)
  expect(fields).toEqual([
    {
      name: 'layout',
      description: 'Where a checkout lands.',
      shape: 'string',
      default: '{dev}/{repo}',
    },
  ])
  expect(nestedFields(shape['authority']!)).toEqual([])

  expect(describeShape(z.enum(['https', 'ssh']))).toBe("'https' | 'ssh'")
  expect(describeShape(z.array(z.string()))).toBe('list<string>')
  expect(describeShape(z.number().int().min(0))).toBe('integer >= 0')
  expect(describeShape(shape['workflows']!)).toBe('map<string, list<string>>')
  expect(jsonSchemaOf(z.object({ a: z.string().describe('A.') }))).toEqual({
    type: 'object',
    properties: { a: { type: 'string' } },
    required: ['a'],
  })
})

test('read and prune a plain value by path', () => {
  const value = { checkout: { layout: 'x', depth: 2 }, authority: 'origin' }
  expect(getIn(value, ['checkout', 'layout'])).toEqual({ found: true, value: 'x' })
  expect(getIn(value, ['checkout', 'nope'])).toEqual({ found: false, value: undefined })
  expect(omitPath(value, ['checkout', 'layout'])).toEqual({
    checkout: { depth: 2 },
    authority: 'origin',
  })
  expect(omitPath(value, ['nope'])).toBe(value)
  expect(value.checkout.layout).toBe('x')
})

// ---------------------------------------------------------------------------
// Layered resolution
// ---------------------------------------------------------------------------

test('resolve a command list through env, local, project and default', async () => {
  const defaults = ['lint', 'test']
  const raw: Record<'local' | 'project', RawLayeredSteps<string> | undefined> = {
    project: { append: ['build'] },
    local: { prepend: ['fmt'] },
  }
  const options: ResolveLayeredStepsOptions<string> = {
    defaultSteps: defaults,
    readRaw: (layer) => raw[layer],
  }
  const wrapped: ResolvedLayeredSteps<string> = await resolveLayeredSteps('check', options)
  expect(wrapped.steps.map((s) => s.step)).toEqual(['fmt', 'lint', 'test', 'build'])
  const first: ResolvedStep<string> = wrapped.steps[0]!
  const source: StepProvenance = first.source
  const layer: ValueLayer = source.layer
  const mode: StepMode = source.mode
  expect([layer, mode]).toEqual(['local', 'prepend'])
  expect(wrapped.steps[3]!.source).toEqual({ layer: 'project', mode: 'append' })

  // A layer that names `steps` replaces what is beneath it. Env replaces everything.
  const replaced = await resolveLayeredSteps('check', {
    defaultSteps: async () => defaults,
    readRaw: (l) => (l === 'project' ? { steps: ['just ci'] } : undefined),
  })
  expect(replaced.steps).toEqual([
    { step: 'just ci', source: { layer: 'project', mode: 'replace' } },
  ])
  const fromEnv = await resolveLayeredSteps('check', { ...options, envSteps: ['true'] })
  expect(fromEnv.steps).toEqual([{ step: 'true', source: { layer: 'env', mode: 'replace' } }])
})

test('resolve a single value through local, project and default', () => {
  const options: ResolveLayeredValueOptions<string> = {
    defaultValue: 'ci',
    readRaw: (layer) => (layer === 'project' ? 'verify' : undefined),
  }
  const projectWins: ResolvedLayeredValue<string> = resolveLayeredValue('retries', options)
  expect(projectWins).toEqual({ value: 'verify', layer: 'project' })
  expect(resolveLayeredValue('retries', { ...options, readRaw: () => 'mine' }).layer).toBe('local')
  expect(resolveLayeredValue('retries', { ...options, readRaw: () => undefined })).toEqual({
    value: 'ci',
    layer: 'default',
  })
})

// ---------------------------------------------------------------------------
// The machine file
// ---------------------------------------------------------------------------

test('keep the machine file valid: read, check, write with a backup', () => {
  expect(envStem('tooly')).toBe('TOOLY')
  expect(envStem('pr-updater')).toBe('PR_UPDATER')
  const machine = machineFile()
  expect(machine.env).toBe('TOOLY_MACHINE_CONFIG')
  expect(machine.path().startsWith(home)).toBe(true)
  expect(machine.currentVersion).toBe(1)

  // No file: all defaults, no issues.
  const none: MachineConfigLoad<z.output<typeof MachineSchema>> = machine.loadWithIssues()
  expect(none.issues).toEqual([])
  expect(none.value.repos).toEqual([])

  machine.write('repos:\n  - ~/dev\n')
  expect(machine.load().repos).toEqual(['~/dev'])
  machine.write('repos:\n  - ~/dev\n  - ~/work\n')
  expect(readFileSync(`${machine.path()}.bak`, 'utf8')).toBe('repos:\n  - ~/dev\n')
  expect(machine.load().repos).toEqual(['~/dev', '~/work'])

  // A write that adds a problem is refused and changes nothing.
  const added: MachineConfigIssue[] = machine.check({ trust: { nope: 1 } })
  expect(added).toEqual([
    { path: ['trust', 'nope'], code: 'unknown_key', message: 'unknown key; ignored' },
  ])
  expect(() => machine.write('trust:\n  nope: 1\n')).toThrow('refusing to write')
  expect(machine.load().repos).toEqual(['~/dev', '~/work'])
})

test('the machine loader never throws and says what it dropped', () => {
  const machine = machineFile()
  const file = machine.path()
  mkdirSync(join(file, '..'), { recursive: true })
  const codes: readonly string[] = MACHINE_CONFIG_ISSUE_CODES

  writeFileSync(file, 'repos: [a]\nmystery: 1\npaths: nope\n')
  const messy = machine.loadWithIssues()
  expect(messy.value.repos).toEqual(['a'])
  expect(messy.value.paths).toEqual({})
  expect(messy.issues.map((i) => i.code).sort()).toEqual(['invalid', 'unknown_key'])
  expect(messy.issues.every((i) => codes.includes(i.code))).toBe(true)

  machine.clearCache()
  writeFileSync(file, 'a: [unclosed\n')
  expect(machine.loadWithIssues().issues[0]!.code).toBe('yaml')
  machine.clearCache()
  writeFileSync(file, '- a\n- b\n')
  expect(machine.loadWithIssues().issues[0]!.code).toBe('not_mapping')
})

test('migrate an older machine file in memory and on disk', () => {
  const rename: MachineMigration = {
    from: 1,
    to: 2,
    run: (raw) => {
      const { dirs, ...rest } = raw
      return { ...rest, repos: dirs ?? [] }
    },
  }
  expect(currentMachineVersion([])).toBe(1)
  expect(currentMachineVersion([rename])).toBe(2)
  expect(migrateMachineRaw({ dirs: ['~/dev'] }, [rename])).toEqual({
    raw: { repos: ['~/dev'], version: 2 },
    applied: [2],
  })
  expect(migrateMachineRaw({ version: 2, repos: [] }, [rename]).applied).toEqual([])

  const Versioned = MachineSchema.extend({ version: z.number().int().optional() }).strict()
  const dirs = systemDirs(VENDOR, { home, env: {} })
  const machine = machineConfigFile({
    tool: 'tooly',
    schema: Versioned,
    vendorDirs: VENDOR,
    dirs: () => dirs,
    migrations: [rename],
  })
  expect(machine.currentVersion).toBe(2)
  mkdirSync(join(machine.path(), '..'), { recursive: true })
  writeFileSync(machine.path(), 'dirs:\n  - ~/dev\n')

  // The old file loads through the migration without being rewritten.
  expect(machine.load().repos).toEqual(['~/dev'])
  const dry: MachineMigrateResult = machine.migrate({ dryRun: true })
  expect(dry).toMatchObject({ from: 1, to: 2, applied: [2], written: false })
  expect(readFileSync(machine.path(), 'utf8')).toContain('dirs:')

  expect(machine.migrate().written).toBe(true)
  expect(parseYaml(readFileSync(machine.path(), 'utf8'))).toEqual({ repos: ['~/dev'], version: 2 })
  expect(machine.migrate().applied).toEqual([])

  // A file from a newer tool is read as-is and flagged.
  machine.clearCache()
  writeFileSync(machine.path(), 'version: 9\nrepos: [x]\n')
  expect(machine.loadWithIssues().issues[0]!.code).toBe('newer_version')
})

// ---------------------------------------------------------------------------
// What a command needs
// ---------------------------------------------------------------------------

test('tell the user which setting a command needs and where to set it', () => {
  const machine = machineFile()
  const needsOptions: ConfigNeedsOptions<typeof ProjectSchema, typeof MachineSchema> = {
    tool: 'tooly',
    projectFile: PROJECT_FILE,
    projectSchema: ProjectSchema,
    machine,
    scaffoldHint: '`tooly config scaffold` shows the full shape',
  }
  const needs: ConfigNeeds = configNeeds(needsOptions)
  const dir = project()

  const scopes: KeyScopes = needs.keyScopes('paths.dev')
  expect(scopes).toEqual({ project: true, machine: true })
  expect(needs.keyScopes('authority')).toEqual({ project: true, machine: false })
  expect(needs.keyScopes('repos')).toEqual({ project: false, machine: true })
  expect(needs.keyExists('nope')).toBe(false)
  expect(needs.keyDescription('repos')).toBe('Directories that hold checkouts.')

  const need: ConfigNeed = { config: 'authority', unlessInput: 'authority' }
  const unset: MetOptions = { project: { authority: '' } }
  expect(needs.met(need, unset)).toBe(false)
  expect(needs.met(need, { project: { authority: 'origin' } })).toBe(true)
  expect(needs.met(need, { ...unset, input: { authority: 'other' } })).toBe(true)

  // A machine-file setting counts too.
  machine.write('repos:\n  - ~/dev\n')
  expect(needs.met({ config: 'repos' }, { project: {} })).toBe(true)

  const message: MessageOptions = { projectRoot: dir, command: ['upload', 'run'] }
  const text = needs.message(need, message)
  expect(text).toContain(
    '`tooly upload run` needs `authority`, and it is not set (or pass --authority).',
  )
  expect(text).toContain('The remote server the tool talks to.')
  expect(text).toContain(`an ${PROJECT_FILE} at the project root (none above ${dir})`)
  expect(text.endsWith('; `tooly config scaffold` shows the full shape.')).toBe(true)

  write(dir, PROJECT_FILE, 'authority: ""\n')
  expect(needs.whereToSet('authority', dir)).toBe(join(dir, PROJECT_FILE))
  expect(needs.whereToSet('paths.dev', dir)).toContain(' or the machine config (')
  expect(needs.message({ config: 'authority' }, { projectRoot: dir })).toMatch(
    /^this command needs/,
  )
  expect(existsSync(machine.path())).toBe(true)
})
