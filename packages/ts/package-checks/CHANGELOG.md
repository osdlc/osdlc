# @osdlc/package-checks

## 0.1.0

### Minor Changes

- 1208616: The first release of `@osdlc/package-checks`: the package checks that osdlc/osdlc ran from `scripts/`, as a package any repository with the same layout can use.
  
  - The `package-checks` command: `ts` (pack each TypeScript package and check its shape, publint, Are The Types Wrong and a clean consumer), `rust` (the shape of every crate in the Cargo workspace), `semver` (a breaking change to a crate on crates.io sets its version), `affected` (the packages a pull request changed, and their dependents) and `stage` (a new package's placeholder on npm and its trusted publisher).
  - The defaults are osdlc's rules (`OSDLC`). `package-checks.json` at a repository's root changes the licence, licence files, author, base engine, folders, config packages, the catalog rule, the root lint config, extra shared paths for `affected`, crate twins with another name, and the npm scope `stage` accepts.
  - `stage` takes the trusted publisher's repository from the package's `repository.url`, so it works for any GitHub repository.
  - publint and Are The Types Wrong are dependencies, so a repository needs neither installed. Cargo manifests are read with `smol-toml`.
  - The checks are exported as functions over data (`shapeTs`, `shapeRs`, `pick`, `nextBreaking` and others), with `checkTsPackages`, `checkWorkspace` and `semverCheck` over a repository on disk.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.
