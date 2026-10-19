# Intersect

A path-pattern overlap engine. It answers one question: do two globs share a
common matching path? Pure pattern algebra over patterns-as-languages — it never
touches the filesystem, except through the opt-in `@osdlc/intersect/fs` layer.

## Install

```sh
npm install @osdlc/intersect
# or
pnpm add @osdlc/intersect
# or
bun add @osdlc/intersect
```

Ships ES modules with TypeScript declarations, as compiled ES2022 JavaScript in
`dist/`.

## Entry points

Three subpaths, layered so dependencies point down.

| Import | Layer | What it is | Runtime deps |
|---|---|---|---|
| `@osdlc/intersect` | L1 path API | Friendly surface: parses glob strings, set-aware primitives, the registry. | none |
| `@osdlc/intersect/segments` | L0 core | Pure engine over pre-split segment arrays — no strings, no disk. | none |
| `@osdlc/intersect/fs` | L2 filesystem | Async resolution against a real on-disk tree. | `tinyglobby` |

The core, the segments engine, and the path API pull **zero** runtime
dependencies. Only `@osdlc/intersect/fs` pulls `tinyglobby`; the dependency boundary is
the entry-point split itself.

## The rule: exact match vs. subtree

A pattern with **no wildcards is an exact-path match**. There is no
directory/file inference and no ambiguity error: a bare path is exactly that
path, and you opt into a subtree with `/**`.

```ts
import { intersects } from "@osdlc/intersect";

// No wildcards → an EXACT-path match:
intersects("src/siteA/components", "src/siteA/components");            // true  (same path)
intersects("src/siteA/components", "src/siteA/components/Button.vue"); // false (a child, not the path)

// A subtree is opted into explicitly with `**`:
intersects("src/siteA/components/**", "src/siteA/components/Button.vue"); // true
```

## Examples

### The core question — does one pattern overlap another?

```ts
import { intersects } from "@osdlc/intersect";

intersects("src/**/*.ts", "src/api/handler.ts"); // true  — the file is inside the glob
intersects("src/api/**", "src/web/**");           // false — disjoint subtrees
intersects("src/api/**", "src/**/*.ts");          // true  — src/api/x.ts is common to both
```

### Registry — which guidelines/standards apply to a scope

Index labeled pattern-sets, then ask which apply to where you are about to work.
Pure overlap, so the target files need not exist yet.

```ts
import { index } from "@osdlc/intersect";

const guidelines = index([
  { id: "guidelines/UI",     patterns: ["**/*.{vue,html,jsx}"] },
  { id: "guidelines/UI/vue", patterns: ["**/*.vue"] },
  { id: "guidelines/api",    patterns: ["src/api/**"] },
]);

// About to work under a directory — write the subtree explicitly (no files need exist):
guidelines.applicableTo("src/siteA/components/**");
// → ["guidelines/UI", "guidelines/UI/vue"]   (the api guideline does not overlap)
```

### Filesystem — resolve against a real tree (`@osdlc/intersect/fs`)

The only entry that reads disk, and the only one that pulls a globber.

```ts
import { filesInScope } from "@osdlc/intersect/fs";

// Every existing file under the scope:
const context = await filesInScope(["src/api/**", "src/db/**"], { cwd: repoRoot });
// → ["src/api/user.ts", "src/api/routes/list.ts", "src/db/pool.ts", ...]
```

## Status

`v0.1`. Pattern-level negation (`!pat`) and `intersection(a, b)` are deferred
past v1.

## License

MIT or Apache-2.0, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
