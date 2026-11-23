# @osdlc/markdown-vault

Read a vault of Markdown notes into a plain data model. `scanVault` walks a folder and returns
each note's frontmatter, tags, wikilinks, embeds and backlinks. `createVaultIndex` builds the same
model from note data you already hold, with no file access. The Obsidian app is never involved.

A planned corpus model, `markdown-corpus`, is expected to absorb this package. Today
[`markdown-corpus`](../../rust/markdown-corpus) is a Rust crate and not this package's twin: the
two do not share a conformance suite, and their link rules differ.

## Who it is for

A TypeScript tool that needs to know what is in a folder of notes written the Obsidian way
(`[[wikilinks]]`, `![[embeds]]`, `#tags`, YAML frontmatter) and which notes link to which. Examples
are a link graph, a note browser, a query layer ([`@osdlc/markdown-vault-query`](../markdown-vault-query)
runs Bases-style queries over this model) or a check that finds broken links.

## When not to use it

- To write or edit notes. The package only reads. To edit frontmatter without changing the other
  bytes of a note, use [`@osdlc/frontmatter-lossless`](../frontmatter-lossless).
- To render a note. It does not turn Markdown into HTML.
- To keep an index up to date as files change. `scanVault` reads the whole folder each time. The
  Rust [`markdown-corpus`](../../rust/markdown-corpus) crate refreshes only what changed.
- To scan a folder you do not trust. See [Symbolic links](#symbolic-links).

## Install

```sh
npm install @osdlc/markdown-vault
```

ESM only. Node.js 22 or later.

## Quick start

```ts
const vault: VaultIndex = await scanVault(root)
const plan: VaultNote = vault.byPath.get('Plan.md')!

const file: FileMeta = plan.file
expect(file.basename).toBe('Plan')
expect(file.folder).toBe('')
expect(plan.properties).toEqual({ tags: ['project'] })
expect(plan.tags).toEqual(['project', 'todo'])

const link: LinkRef = plan.links[0]!
expect(link).toEqual({ target: 'Ideas', path: 'notes/Ideas.md', display: null })
expect(plan.embeds[0]!.path).toBe('notes/diagram.png')
expect(vault.byPath.get('notes/Ideas.md')!.backlinks).toEqual(['Plan.md'])
```

The snippet comes from [`examples/scan-vault.test.ts`](./examples/scan-vault.test.ts), where `root`
holds `Plan.md`, `notes/Ideas.md` and `notes/diagram.png`. The other snippets below come from
the other files in [`examples/`](./examples/), which the tests run.

## API

| Export                    | Kind     | What it does                                                                        |
| ------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `scanVault`               | function | Walk a folder and return its `VaultIndex`.                                          |
| `createVaultIndex`        | function | Build a `VaultIndex` from note data you hold. No file access.                       |
| `createLinkResolver`      | function | Resolve a link target to a note, by the scanner's rules.                            |
| `parseFrontmatter`        | function | The YAML frontmatter of a note as an object, or `{}`.                               |
| `extractLinks`            | function | The wikilinks and embeds of a body, unresolved.                                     |
| `extractInlineTags`       | function | The inline `#tags` of a body.                                                       |
| `VaultIndex`              | type     | `root`, `notes` and `byPath`.                                                       |
| `VaultNote`               | type     | One file: `file`, `properties`, `tags`, `links`, `embeds`, `backlinks`.             |
| `FileMeta`                | type     | Name, basename, path, folder, extension, size and times.                            |
| `LinkRef`                 | type     | A link: `target` as written, resolved `path` or `null`, `display` alias or `null`.  |
| `ScanOptions`             | type     | Options of `scanVault`: `includeNonMarkdown`, `tagDialect`.                         |
| `ExternalNote`            | type     | One note's data for `createVaultIndex`. Only `path` is required.                    |
| `CreateVaultIndexOptions` | type     | Options of `createVaultIndex`: `resolveLinks`.                                      |

Every export has TSDoc in the published declarations.

### Scanning

`scanVault(root, options?)` returns a promise of a `VaultIndex`. Paths are relative to `root`,
always separated by `/`, and notes are sorted by path. `index.root` is `root` as passed.

```ts
const options: ScanOptions = { includeNonMarkdown: false, tagDialect: 'unicode' }
const vault = await scanVault(root, options)

expect(vault.notes.map((note) => note.file.path)).toEqual(['A.md'])
expect(vault.byPath.get('A.md')!.tags).toEqual(['2024', 'draft'])
```

| Option               | Default    | Effect                                                                         |
| -------------------- | ---------- | ------------------------------------------------------------------------------ |
| `includeNonMarkdown` | `true`     | Also index files that are not `.md`, with file metadata only.                  |
| `tagDialect`         | `obsidian` | The inline tag rule: `obsidian`, `unicode` or `ascii`, from `@osdlc/markdown-tags`. |

A note's `tags` are the frontmatter `tags` or `tag` key (a list, or a comma or space separated
string), then the inline tags, with the `#` removed and duplicates dropped. Links, embeds and tags
inside code are skipped. A non-Markdown file has no properties, tags or links.

The walk skips every entry whose name starts with `.` (so `.obsidian`, `.git` and `.trash`) and
every entry named `node_modules`.

The promise rejects with the error Node throws when `root` does not exist, or when `root`, a folder
under it or a Markdown note in it cannot be read. One unreadable note rejects the whole scan; no
partial index comes back.

### Building from data

```ts
const notes: ExternalNote[] = [
  { path: 'Plan.md', tags: ['#project'], links: ['Ideas'], mtimeMs: 1_700_000_000_000 },
  { path: 'notes/Ideas.md', frontmatter: { status: 'open' }, aliases: ['Brainstorm'] },
]
const options: CreateVaultIndexOptions = { resolveLinks: true }
const vault = createVaultIndex(notes, options)

expect(vault.root).toBe('')
expect(vault.byPath.get('Plan.md')!.tags).toEqual(['project'])
expect(vault.byPath.get('Plan.md')!.links[0]!.path).toBe('notes/Ideas.md')
expect(vault.byPath.get('notes/Ideas.md')!.backlinks).toEqual(['Plan.md'])
expect(vault.byPath.get('notes/Ideas.md')!.properties).toEqual({
  status: 'open',
  aliases: ['Brainstorm'],
})
```

By default links stay unresolved (`path: null`) and `backlinks` is what you supplied, with repeats
dropped. With `resolveLinks: true` the links resolve against the notes you passed, and the
backlinks computed from them are added to the ones you supplied.
`frontmatter` may be an object or a JSON string; a string that is not a JSON object gives `{}`.
`title` and `aliases` fill the properties when the frontmatter has no such key. Give each note its
own `path`: when two share one, both stay in `notes` and `byPath` holds the later one.
`createVaultIndex` and `scanVault` share one normalisation, so the same data gives the same index.

The package imports no `node:` module until `scanVault` first runs, so a browser bundle can import
`createVaultIndex`.

### Link resolution

`createLinkResolver(index)` returns `(target, from?) => VaultNote | null`. `scanVault` resolves
every body link with it, and you can use it for a target found elsewhere, such as a frontmatter
value.

```ts
const vault = createVaultIndex([
  { path: 'Plan.md' },
  { path: 'projects/Plan.md' },
  { path: 'projects/Notes/Ideas.md' },
  { path: 'logo.png' },
])
const resolve = createLinkResolver(vault)

// An exact path wins, then the shortest path among files of the same name.
expect(resolve('projects/Plan')?.file.path).toBe('projects/Plan.md')
expect(resolve('plan')?.file.path).toBe('Plan.md')
// An extension names that file, and a relative target reads from the note it is in.
expect(resolve('logo.png')?.file.path).toBe('logo.png')
const from = vault.byPath.get('projects/Plan.md')
expect(resolve('./Notes/Ideas', from)?.file.path).toBe('projects/Notes/Ideas.md')
expect(resolve('Missing')).toBeNull()
```

The rules, in order:

1. An exact path. A target with no extension tries the `.md` note before a file of that bare name.
2. The extension rules. A target with an extension matches that file name and never a same-name
   note, so `[[logo.png]]` does not land on `logo.md`. A target with no extension matches a `.md`
   note, then a file with no extension, and never an attachment.
3. The shortest path among files of the same name.

Matching ignores case. A folder-qualified target (`[[projects/Plan]]`) must match whole path
segments and stays unresolved when no file in that folder matches. A relative target (`./sib`,
`../b/note`) names one path, read from the folder of the note it is in (`from`) or from the vault
root, and stays unresolved when no file is there or the path leaves the vault. A resolver builds
its name table on first use, so make a new one after changing the index.

### Helpers

The per-file pieces the scanner is built from.

```ts
expect(parseFrontmatter('---\ntitle: Plan\ndraft: true\n---\nBody')).toEqual({
  title: 'Plan',
  draft: true,
})
expect(parseFrontmatter('No frontmatter')).toEqual({})
expect(parseFrontmatter('---\nkey: [unclosed\n---\n')).toEqual({})
```

`parseFrontmatter` returns `{}` for no frontmatter, malformed YAML or YAML that is not a mapping. It
accepts a byte-order mark, padded fences and blank lines before the first fence.

```ts
const { links, embeds } = extractLinks(
  'See [[Plan#Goals|the goals]] and ![[logo.png]] `[[code]]`',
)

expect(links).toEqual([{ target: 'Plan', path: null, display: 'the goals' }])
expect(embeds).toEqual([{ target: 'logo.png', path: null, display: null }])
```

`extractLinks` leaves out Markdown links such as `[text](./note.md)` and links inside code.

```ts
const body = '#2024 (#draft) #santé'

expect(extractInlineTags(body)).toEqual(['draft', 'santé'])
expect(extractInlineTags(body, { tagDialect: 'unicode' })).toEqual(['2024', 'santé'])
expect(extractInlineTags(body, { tagDialect: 'ascii' })).toEqual(['draft', 'sant'])
```

`extractInlineTags` keeps duplicates. Pass the body, not the frontmatter.

## Symbolic links

`scanVault` follows a symbolic link wherever it points, so a link in the vault that points outside
it indexes the files it reaches, with their frontmatter. A broken link is skipped, and a link back
up the tree is not walked twice. Scan only vaults you trust. See [SECURITY.md](./SECURITY.md).

## Alternatives

| Package                                                                    | Does                                                        | How it differs                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`markdown-corpus`](../../rust/markdown-corpus) (Rust, this repository)    | Files, links both ways, frontmatter and tags, refreshed incrementally | Rust only. It is the planned home of this package's model.   |
| [`markdown-vault-fs`](../../rust/markdown-vault-fs) (Rust, this repository) | The vault walk and its skip rules                           | Parses no frontmatter, tags or links.                                       |
| [`@osdlc/markdown-link`](../markdown-link)                                 | Finds wikilinks in a body                                   | One note at a time. This package uses it and adds a vault and resolution.   |
| [`@osdlc/markdown-tags`](../markdown-tags)                                 | Finds inline tags in a body                                 | One note at a time. This package uses it.                                   |
| [`@osdlc/frontmatter-lossless`](../frontmatter-lossless)                   | Splits and rejoins frontmatter byte for byte                | Edits a note. This package only reads.                                      |
| [`@osdlc/corpus-query`](../corpus-query)                                   | Queries a typed corpus                                      | Works on a corpus of schema-typed records, not an Obsidian-style vault.     |
| [`@osdlc/markdown-vault-astro`](../markdown-vault-astro)                   | Brings vault wikilinks and embeds into Astro                | A site integration. It builds no model of the vault.                        |
| `obsidian-vault-parser`, `@dubin/obsidian-vault-parser` (npm)              | Parse a vault's notes with `gray-matter`                    | Last released in 2022 and 2023. No backlinks resolution rules.              |
| `gray-matter` (npm)                                                        | Parses frontmatter                                          | Frontmatter only.                                                           |
| `vaultmd` (npm)                                                            | Notes CRUD, SQLite index, backlinks, full-text search       | Runs under Bun only (`bun:sqlite`). A stateful index and writer.            |
| `@quartz-community/remark-obsidian` (npm)                                  | A remark plugin for Obsidian syntax in one note             | Works inside one note. No folder scan, backlinks or model.                  |

## Runtimes and platforms

| Runtime | Status                                              |
| ------- | --------------------------------------------------- |
| Node 22 | Tested.                                             |
| Node 24 | Tested.                                             |
| Browser | `createVaultIndex` and the helpers. `scanVault` needs Node. |

| Platform | Status         |
| -------- | -------------- |
| Linux    | Tested.        |
| macOS    | Tested.        |
| Windows  | Not tested.    |

The symlink tests skip on a machine where a symbolic link cannot be created.

## Stability

The package is on the 0.x line. Every export is stable: a breaking change to one ships in a new
minor release, with a changelog entry that starts with `Breaking:`. No export is experimental.

## Licence

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at your option. The
licence expression is `MIT OR Apache-2.0`.
