# @osdlc/harness-knowledge

Compiled facts about coding-agent harnesses: the binary a harness runs as, the flags for its
permission modes, the environment variables that mark a process as inside it, where its config
and skills live, which instruction files it reads. The package ships one JSON file, its JSON
Schema, TypeScript types, and a `lookup()` that picks the value for a harness, subject, version,
platform and model.

Every value carries a `basis`: a permalink to the statement, at a fixed commit of
[osdlc/skillwright](https://github.com/osdlc/skillwright), that sets it. Nothing in the file is
unsourced, and a reader can always follow the link to the evidence.

## Install

```sh
npm install @osdlc/harness-knowledge
```

## Use

```ts
import { loadKnowledge, lookup, fact } from '@osdlc/harness-knowledge'

const found = lookup(loadKnowledge(), 'codex', 'skills/user-dirs', { version: '0.50.0' })
if (found !== undefined) {
  found.value // { dirs: ['~/.agents/skills'], ... }
  found.strength // 'strong' | 'moderate' (weak only with accept: { weak: true })
  found.basis // https://github.com/osdlc/skillwright/blob/<sha>/...
  found.disputed // true only with accept: { disputed: true }
}

// The object value when it is at least moderate and not disputed, else undefined.
fact('codex', 'skills/user-dirs')?.dirs
```

`lookup(knowledge, harness, subject, { version?, platform?, model?, accept? })` returns
`{ value, strength, basis, disputed }` or `undefined`.

- `since` is inclusive and `until` exclusive. With no `version`, only values with `until: null`
  match.
- An empty `platform` list or a null `model` matches any caller. A listed one matches only a
  caller that names it. The most specific match wins.
- A dimension the caller omits ranks a value that is broad on it above one that is narrow on it,
  so with no `platform` or `model` the unscoped value wins. When only scoped values exist, the
  specific one is returned anyway (a lone macOS value is returned to a caller who names no
  platform), but a caller who names a platform it does not list gets `undefined`.
- Weak and disputed values are skipped unless `accept: { weak: true }` or
  `accept: { disputed: true }` is passed.
- Two equally specific matches throw `AmbiguousValue`. That is a bug in the source data.

Harness and subject keys are slugs such as `claude-code` and `cli/binary`; the file's `harnesses`
and `subjects` maps list them, and each subject carries the JSON Schema of its value.

The data is also importable on its own:

```ts
import knowledge from '@osdlc/harness-knowledge/data/harness-knowledge.json' with { type: 'json' }
```

## Where the data comes from

`data/harness-knowledge.json` and `data/harness-knowledge.schema.json` are compiled by
`harness-reference` in [osdlc/skillwright](https://github.com/osdlc/skillwright) from its
statements, and copied here unchanged. Only current and disputed statements are in the file.
To update:

```sh
pnpm --filter @osdlc/harness-knowledge run sync --from <dir with the compiled files>
pnpm --filter @osdlc/harness-knowledge run sync --release <skillwright release tag>
```

`--release` downloads the two assets from the osdlc/skillwright release with `gh`. A test checks
the data file against the schema.

## Licence

`MIT OR Apache-2.0`. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
