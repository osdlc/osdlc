# @osdlc/harness-knowledge

Compiled facts about coding-agent harnesses: the binary a harness runs as, the flags for its
permission modes, the environment variables that mark a process as inside it, where its config
and skills live, which instruction files it reads. The package ships one JSON file, its JSON
Schema, TypeScript types, and a `lookup()` that picks the value for a harness, subject, version,
platform and model.

Every value carries a `basis`: a permalink to the statement that sets it, at a fixed commit of
the corpus. Nothing in the file is unsourced, and a reader can always follow the link to the
evidence. The file's `corpus` block names the repository, folder and commit the links use.

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
  found.basis // https://github.com/<repo>/blob/<sha>/.../statements/...
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

## Ids, credentials and config folders

Other packages name harnesses with short ids (`claude`, `copilot`, `deepseek`); the file uses
slugs (`claude-code`, `copilot-cli`, `dsh`). `HARNESS_SLUGS` is the map. `credentialEnv` and
`configDirEnv` read the variable names the file states under `config/credentials-env` and
`config/config-dir-env`; both accept an id or a slug.

The map is frozen, and `HarnessId` and `HarnessSlug` are the types of its keys and values.

```ts
import {
  HARNESS_SLUGS,
  slugFor,
  idFor,
  credentialEnv,
  configDirEnv,
} from '@osdlc/harness-knowledge'

HARNESS_SLUGS.copilot // 'copilot-cli'
slugFor('claude') // 'claude-code'; undefined for a name with no slug
idFor('dsh') // 'deepseek'
credentialEnv('codex') // ['CODEX_API_KEY', 'OPENAI_API_KEY']
configDirEnv('claude') // 'CLAUDE_CONFIG_DIR'
```

The data is also importable on its own:

```ts
import knowledge from '@osdlc/harness-knowledge/data/harness-knowledge.json' with { type: 'json' }
```

## Where the data comes from

`data/harness-knowledge.json` is compiled from the harness reference, the corpus of statements in
[`packages/corpora/harness-reference`](https://github.com/osdlc/osdlc/tree/main/packages/corpora/harness-reference)
of this repository. It is not committed: `pnpm run build` writes it (`build:data`, before `tsc`),
and the published package ships it. `data/harness-knowledge.schema.json` is committed and
reviewed by hand; the build fails if the compiler writes something else. Only current and
disputed statements are in the file.

`loadKnowledge` imports the file as a JSON module, so a bundler inlines it and Node loads it from
the package. It reads no path relative to its own module.

Every `basis` link names the commit the corpus was compiled at, `HEAD`. A build from a commit of
`origin/main`, as the release job does, gives links that last. A local build from any other
commit warns that its links name a commit that may never be published.

The corpus came here from [osdlc/skillwright](https://github.com/osdlc/skillwright). Data
published from there has `corpus.repo` `osdlc/skillwright`, and its `basis` links name a commit of
that repository. They still resolve.

A change to a fact is one pull request, the corpus change. Build first, since the tests, the
typecheck and the dependents' tests read the compiled file:

```sh
pnpm --filter '@osdlc/harness-knowledge...' run build
pnpm --filter @osdlc/harness-knowledge run check:release
```

`check:release` is what CI runs on a pull request. When the compiled values differ from the
version on npm, a changeset naming `@osdlc/harness-knowledge` must be in the pull request, since
that is what releases the change. A test checks the data file against the schema.

## Licence

`MIT OR Apache-2.0`. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
