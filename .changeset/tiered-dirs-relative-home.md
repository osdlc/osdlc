---
'@osdlc/tiered-dirs': patch
---

A relative `HOME` (`USERPROFILE` on Windows) now counts as unset. Every home built on it used to land under the working directory, so a `.env` loader that set `HOME=.` put config, state and cache inside whatever directory the tool ran in. The OS account's home (`os.userInfo().homedir`) is used instead, or, with an injected `env`, `MISSING_BASE_DIR` is thrown. The Rust crate treats a relative `HOME` as unset too, but has no account-home fallback.
