# @osdlc/intersect

Do two globs share a common matching path?

Most glob tools test one path against one pattern. This package compares two
patterns with each other. It tells you whether some path could match both. It
can also return an example of such a path.

It is for tools that need to find overlap between sets of paths. Examples are:
detecting that two tasks claim the same files, finding which rules apply to a
folder, or checking that two ignore lists do not collide. The patterns do not
need to match files that exist.

Do not use it to filter a list of files by a pattern. Use
[picomatch](https://github.com/micromatch/picomatch) or
[tinyglobby](https://github.com/SuperchupuDev/tinyglobby) for that. This package
is also not a full glob dialect: see [Syntax](#syntax).

## Install

Requires Node 22 or later.

```sh
npm install @osdlc/intersect
# or
pnpm add @osdlc/intersect
# or
bun add @osdlc/intersect
```

The package is ES modules with TypeScript declarations.

## How it differs from other glob packages

| Package | What it does |
|---|---|
| `@osdlc/intersect` | Compares two patterns with each other. |
| [glob-intersection](https://www.npmjs.com/package/glob-intersection) | Also works on two patterns. It returns a new pattern for the overlap. This package returns a yes or no, and an example path. |
| [picomatch](https://github.com/micromatch/picomatch), [micromatch](https://github.com/micromatch/micromatch), [minimatch](https://github.com/isaacs/minimatch) | Test one path against one pattern. They cannot compare two patterns. |
| [tinyglobby](https://github.com/SuperchupuDev/tinyglobby) | Lists the files on disk that match a pattern. This package uses it only in the optional `./fs` entry. |

## Entry points

| Import | What it is | Runtime dependencies |
|---|---|---|
| `@osdlc/intersect` | Takes glob strings. Overlap checks and the registry. | none |
| `@osdlc/intersect/segments` | The engine, on patterns already split into segments. | none |
| `@osdlc/intersect/fs` | Resolves patterns against a real folder. | `tinyglobby` |

Only `@osdlc/intersect/fs` reads the disk or loads `tinyglobby`.

## Exact path or subtree

A pattern with no wildcards matches exactly that path. To match a subtree,
write `/**`.

```ts
import { intersects } from "@osdlc/intersect";

// No wildcards: an exact path.
intersects("src/siteA/components", "src/siteA/components");            // true
intersects("src/siteA/components", "src/siteA/components/Button.vue"); // false (a child, not the path)

// A subtree is explicit.
intersects("src/siteA/components/**", "src/siteA/components/Button.vue"); // true
```

## Examples

### Does one pattern overlap another?

```ts
import { intersects } from "@osdlc/intersect";

intersects("src/**/*.ts", "src/api/handler.ts"); // true  (the file is inside the glob)
intersects("src/api/**", "src/web/**");           // false (disjoint subtrees)
intersects("src/api/**", "src/**/*.ts");          // true  (src/api/x.ts is in both)
```

### Registry: which rules apply to a scope?

Index labeled sets of patterns. Then ask which apply to the place you are about
to work. The files do not need to exist.

```ts
import { index } from "@osdlc/intersect";

const guidelines = index([
  { id: "guidelines/UI",     patterns: ["**/*.{vue,html,jsx}"] },
  { id: "guidelines/UI/vue", patterns: ["**/*.vue"] },
  { id: "guidelines/api",    patterns: ["src/api/**"] },
]);

guidelines.applicableTo("src/siteA/components/**");
// → ["guidelines/UI", "guidelines/UI/vue"]   (the api guideline does not overlap)
```

### Filesystem: resolve against a real folder

```ts
import { filesInScope } from "@osdlc/intersect/fs";

const context = await filesInScope(["src/api/**", "src/db/**"], { cwd: repoRoot });
// → ["src/api/routes/list.ts", "src/api/user.ts", "src/db/pool.ts", ...]
```

## Syntax

Supported: `*`, `**`, `?`, `[abc]`, `[a-z]`, `[!abc]`, `{a,b}` and `\` to
escape.

## Status

Version 0.x. The API may change in a minor release. Read the
[CHANGELOG](./CHANGELOG.md) before you upgrade.

## Security

See [SECURITY.md](./SECURITY.md) for how to report a problem and for limits on
untrusted patterns. To contribute, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT or Apache-2.0, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
