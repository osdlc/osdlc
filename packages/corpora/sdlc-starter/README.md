# @osdlc/corpus-sdlc-starter

The sdlc starter is a small knowledge base that a work repo references and cites. It holds shared
records, for now two draft principles, as a corpus-schema corpus. Its types come from the
[sdlc profile](../../profiles/sdlc/), `@osdlc/corpus-profile-sdlc`, which it names under `extends`
and takes through `uses: [sdlc/*]`.

| Record                                                        | Title                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| [P-0001](corpus/principles/P-0001.md) | Normalize equivalent inputs at the boundary, and reject invalid ones |
| [P-0002](corpus/principles/P-0002.md) | Favor deterministic over probabilistic judgement                    |

Both are `open/draft` and marked `need_human_review: true`.

## Reference it from a repo

Install the starter and the profile in the folder that holds your corpus, or in any folder above
it. The profile is a peer dependency of the starter, so your project holds one version of it:

```sh
pnpm add -D @osdlc/corpus-sdlc-starter @osdlc/corpus-profile-sdlc
```

Name both in your corpus's root file. The profile gives your corpus its types, under `extends`. The
starter gives it records to cite, under `references`. `extends` and `uses` need level 2:

```yaml
---
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
references:
  osdlc: "@osdlc/corpus-sdlc-starter"
uses: [sdlc/*]
---
```

Your `principles/` folder needs no schema file: `uses` gives it the profile's type, which the
starter's principles have too.

Cite a starter principle by id, as a quoted wikilink: `related: ["[[P-0002]]"]`. The validator
finds it among the starter's records. A wikilink to a referenced corpus's record is a link into its
copy, so write the copy and commit it:

```sh
npx @osdlc/corpus-schema sync docs/planning
npx @osdlc/corpus-schema validate --strict docs/planning
```

`sync` writes `_references/osdlc/` beside your root file. The profile gets no copy, since it gives
types only. Run `sync` again after you update the starter. A record of yours may share an id with a
starter record, but a reference by id that matches both is an error, so keep your ids apart.

[profiles/sdlc/tests/downstream/](../../profiles/sdlc/tests/downstream/) is a corpus set up this
way.

## Add a principle

1. Take the next free id: `P-0003`.
2. Write `corpus/principles/P-0003.md`. Copy the frontmatter of
   [P-0002](corpus/principles/P-0002.md), and set `id`, `title` and `created`. Keep
   `state: open/draft` and `need_human_review: true` until it is reviewed.
3. Give it exactly one category tag: `principle/product`, `principle/technical`,
   `principle/project` or `principle/llm-ai`.
4. Write the body: `## Statement`, `## Why` and `## How it applies`. The profile does not check
   body sections yet.
5. Check it, from the repository root: `pnpm install --frozen-lockfile`, then
   `sh profiles/sdlc/tests/package.sh` and `sh tools/leak-check.sh`.
6. Add a changeset for `@osdlc/corpus-sdlc-starter`.

The starter names each record by its id alone, `P-0003.md`. A name with a slug, such as
`P-0003-a-slug.md`, works too: corpus-schema cuts the id out of the file name.
