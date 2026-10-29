# {{launcher}}

{{description}}

```sh
npx {{launcher}} --help
npm install --global {{launcher}}
```

This package is a small launcher. npm installs the matching native binary from one of the
`{{scope}}/{{platformPrefix}}-<os>-<cpu>` packages, listed here as optional dependencies, and
the launcher runs it. Supported platforms: {{platforms}}. Windows is not supported yet.

If the command reports that the platform package is missing, reinstall without
`--omit=optional` or `--no-optional`.

The macOS binaries are not signed or notarized yet. npm does not quarantine what it installs,
so Gatekeeper does not block them.

The same binaries are on the GitHub Release `skillwright/v<version>` of
[osdlc/osdlc](https://github.com/osdlc/osdlc/releases), and `cargo binstall skillwright`
installs them. The crate's README is the user guide:
<https://github.com/osdlc/osdlc/tree/main/packages/rust/skillwright#readme>.

Licensed under MIT or Apache-2.0, at your option. Licenses of the open-source crates the binary
includes are in `THIRD_PARTY_NOTICES.md`.
