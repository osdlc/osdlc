# tradecraft

**tradecraft is now [skillwright](https://crates.io/crates/skillwright).**

## Install

Install skillwright instead:

```sh
cargo install skillwright
```

`cargo install tradecraft` installs a binary that prints this pointer and
exits with status 1. `cargo add tradecraft` adds a library with only
`tradecraft::NOTICE`, the text of the pointer. `cargo binstall tradecraft` now
builds from source, because there is no prebuilt binary.

skillwright 0.3.7 is the same tool under a new name. Its README lists every
renamed file, key and variable, and the errors that point you to each one.

Versions up to 0.3.7 are the CLI and its library under the old name. Version
0.4.0 keeps only the notice. The name may be reused for something else later.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
