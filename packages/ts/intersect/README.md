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
is also not a full glob dialect: see [Supported syntax](#supported-syntax).

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

| Import | What it is | Takes | Runtime dependencies |
|---|---|---|---|
| `@osdlc/intersect` | Overlap checks and the registry. | glob strings such as `"src/**/*.ts"` | none |
| `@osdlc/intersect/segments` | The engine, on patterns already split into segments. | arrays such as `["src", "**", "*.ts"]` | none |
| `@osdlc/intersect/fs` | Resolves patterns against a real folder. | glob strings | `tinyglobby` |

Only `@osdlc/intersect/fs` reads the disk or loads `tinyglobby`.

`intersects`, `matches` and `witness` exist in both `@osdlc/intersect` and
`@osdlc/intersect/segments`. They answer the same question at two layers, and
the import path says which one you call:

- The root functions take strings. `matches(path, patterns)` reads `path` as the
  literal name it is: `pages/[id].vue` is that file, not a character class.
- The `./segments` functions take segment arrays. `matches(path, pattern)` reads
  `path` as a pattern too, and a segment holds no `/`.

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

### Which patterns clash, and where?

`overlapping(query, candidates)` returns the members of `query`.
`compile(query).overlapping(candidates)` returns the members of `candidates`.

```ts
import { compile, overlapping, witness } from "@osdlc/intersect";

const taskA = ["src/api/**", "src/db/schema.ts"];
const taskB = ["src/api/routes/*.ts", "docs/**"];

overlapping(taskA, taskB);         // ["src/api/**"]           (a subset of taskA)
compile(taskA).overlapping(taskB); // ["src/api/routes/*.ts"]  (a subset of taskB)
witness(taskA, taskB);             // "src/api/routes/a.ts"    (a path both claim)
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

Things to know about `./fs`:

- The patterns are globs. To name a file that contains `*?[]{}`, escape those
  characters: `pages/\[id\].vue`.
- The call lists the whole tree under `cwd` first, then filters. It does not
  skip folders the patterns cannot reach, so point `cwd` at the folder you need.
- Symbolic links are neither followed nor listed.
- `ignore` follows the same rules as the patterns. `ignore: ["node_modules"]`
  excludes only a path named exactly `node_modules`. To exclude the folder's
  contents, write `node_modules/**`.
  A pattern that starts with `./` or `/` matches no file, and `!` is not negation.
- Results are sorted by code point. With `absolute: true` they are
  `resolve(cwd, path)`, also when `cwd` is relative.
- A missing or non-directory `cwd`, or a directory that cannot be read, throws
  `IntersectError` with code `IO_ERROR`.

## Supported syntax

A pattern is split on `/` into segments. Each segment can use:

| Syntax | Meaning |
|---|---|
| `*` | Any run of characters inside one segment, including none. |
| `**` as a whole segment | Any number of segments. By default it may match none (`a/**/b` matches `a/b`). |
| `?` | Exactly one character. |
| `[abc]`, `[a-z]` | One character from the set. |
| `[!abc]`, `[^abc]` | One character not in the set. |
| `{a,b}` | Either branch. Branches may be empty (`{,x}`). Groups nest up to 64 deep. |
| `\` | The next character, as itself. |

These throw an `IntersectError` with code `UNSUPPORTED_SYNTAX`, because they
are not supported and would otherwise be read as plain text:

| Syntax | Example | Instead |
|---|---|---|
| A number range | `a{1..3}` | List the values: `a{1,2,3}`. |
| A `{...}` group that holds a `/` | `{x/y,z}` | Use one pattern per branch: `["x/y", "z"]`. |
| A `[...]` class that holds a `/` | `[a/b]` | Write it without the class. |
| An extglob | `+(a\|b)`, `@(a\|b)`, `!(b)`, `?(a)`, `*(a)` | Use `{a,b}`, or escape the `(` to match it as text. |

A pattern nested more than 64 `{` groups deep throws `PATTERN_TOO_DEEP`.

These are not errors, and behave as follows:

- An unclosed `{` or `[`, and a stray `}` or `]`, is plain text.
- A letter range such as `{a..c}` is not expanded. It is a one-branch group that matches the text `a..c`.
- `[[:alpha:]]` is not a POSIX class. A leading `!` is not negation.
- A reversed range such as `[c-a]` matches nothing. A `\` inside a class is plain text.
- `*` and `?` do not match a leading `.` unless `{ dot: true }`. A branch of a `{...}` group
  decides this for itself: `{,a}.env` does not match `.env` but `{.env,a.env}` does.
  With `dot: true` they also match `.` and `..`.
- `*` matches an empty segment: `src//a.ts` matches `src/*/a.ts`.
- `caseInsensitive` folds ASCII letters only. `Ä` does not match `ä`.

## Errors

The package throws `IntersectError` for failures it understands. Branch on its
`code`, not on the message:

| Code | When |
|---|---|
| `UNSUPPORTED_SYNTAX` | A pattern uses syntax listed above as unsupported. Thrown when the pattern is compiled. |
| `PATTERN_TOO_DEEP` | A pattern nests `{` groups more than 64 deep. |
| `DUPLICATE_REGISTRY_ID` | `index()` was given the same `id` twice. |
| `INVALID_ARGUMENT` | An argument has the wrong type, for example a number where a pattern is expected. |
| `IO_ERROR` | `./fs` could not read `cwd` or a directory under it. |

## Status

Version 0.x. The API may change in a minor release. Read the
[CHANGELOG](./CHANGELOG.md) before you upgrade.

## Security

See [SECURITY.md](./SECURITY.md) for how to report a problem and for limits on
untrusted patterns. To contribute, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
