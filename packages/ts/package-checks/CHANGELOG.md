# @osdlc/package-checks

## 0.2.0

### Minor Changes

- 258384e: The exported `Families` type is now `Map<string, { implementations: string[]; readers: string[] }>`, where it was `Map<string, string[]>`. This changes what `readFamilies` returns and the `families` option of `pick`. A caller that builds a `Families` map by hand wraps each list as `{ implementations, readers: [] }`. `readers` are the libraries whose tests read a family's suite without being twins of the reference: a change under a suite or any implementation still runs them, but a change under one reader runs no other.

## 0.1.1

### Patch Changes

- Updated dependencies [e1a5941]
  - @osdlc/command-seam@0.15.0

## 0.1.0

### Minor Changes

- 1208616: The first release of `@osdlc/package-checks`: the package checks that osdlc/osdlc ran from `scripts/`, as a package any repository with the same layout can use.
  
  - The `package-checks` command: `ts` (pack each TypeScript package and check its shape, publint, Are The Types Wrong and a clean consumer), `rust` (the shape of every crate in the Cargo workspace), `semver` (a breaking change to a crate on crates.io sets its version), `affected` (the packages a pull request changed, and their dependents) and `stage` (a new package's placeholder on npm and its trusted publisher).
  - The defaults are osdlc's rules (`OSDLC`). `package-checks.json` at a repository's root changes the licence, licence files, author, base engine, folders, config packages, the catalog rule, the root lint config, extra shared paths for `affected`, crate twins with another name, and the npm scope `stage` accepts.
  - `stage` takes the trusted publisher's repository from the package's `repository.url`, so it works for any GitHub repository.
  - publint and Are The Types Wrong are dependencies, so a repository needs neither installed. Cargo manifests are read with `smol-toml`.
  - The checks are exported as functions over data (`shapeTs`, `shapeRs`, `pick`, `nextBreaking` and others), with `checkTsPackages`, `checkWorkspace` and `semverCheck` over a repository on disk.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.
