//! vfs-seam — the file-access trait a library takes instead of `std::fs`.
//!
//! A library that reads a folder of files through `std::fs` cannot run where
//! there is no filesystem. `wasm32-unknown-unknown` is the case that matters:
//! every `std::fs` call compiles there and then fails at runtime. Taking I/O
//! as a `&dyn Vfs` parameter moves that failure to the host boundary, where
//! a host answers out of whatever it has: a disk, a tree in memory, or a
//! JavaScript object such as Obsidian's `Vault` API.
//!
//! # A trait object, not a generic
//!
//! Callers take `&dyn Vfs`, not `V: Vfs`. Object safety is a requirement: a
//! wasm bridge holds one implementation backed by a table of JS callbacks, so
//! making every public function generic over it costs a type parameter and
//! buys nothing. The trait is not bound by `Send` or `Sync` either, because
//! a JavaScript-backed host is neither.
//!
//! # The method set
//!
//! Ten required methods: reads ([`Vfs::read_file`], [`Vfs::read_dir`],
//! [`Vfs::exists`], [`Vfs::metadata`], [`Vfs::is_executable`]) and writes
//! ([`Vfs::write_file`], [`Vfs::create_dir_all`], [`Vfs::set_executable`],
//! [`Vfs::rename`], [`Vfs::remove`]). `rename` and `remove` are the two
//! mutations an atomic swap is made of.
//!
//! Four more have defaults, so they cost no host anything:
//! [`Vfs::canonicalize`], [`Vfs::read_link`], [`Vfs::is_symlink`] and
//! [`Vfs::sees_links`], the questions only a real filesystem can answer about
//! links. A host that cannot resolve links inherits the lexical answer.
//!
//! # Three implementations
//!
//! [`NativeVfs`] is `std::fs` (the `native` feature, on by default).
//! [`MemVfs`] is a tree in memory. [`PreviewVfs`] wraps one of the others,
//! passes reads through, and captures mutations (writes as bytes, renames and
//! removals as a [`PlannedOp`] list), which is how a dry run classifies what
//! it would do without doing it.
//!
//! # Directory listings, not a walker
//!
//! [`Vfs::read_dir`] lists one directory. Recursion lives above the seam (in
//! `markdown-vault-fs`, for a vault), so the traversal rules are the same on
//! every host rather than something each bridge reimplements.
//!
//! # Time
//!
//! [`Clock`] is the same idea for the current time, which a cache with a
//! time-to-live needs and `wasm32-unknown-unknown` cannot read.
//! [`SystemClock`] (native) reads the system clock; [`FixedClock`] is moved
//! by hand in tests.
//!
//! # Features
//!
//! - `native` (default): [`NativeVfs`] and [`SystemClock`]. Leave it off for
//!   `wasm32-unknown-unknown`; the rest of the crate uses no `std::fs`.

mod clock;
mod error;
mod vfs;

#[cfg(feature = "native")]
pub use clock::SystemClock;
pub use clock::{Clock, FixedClock};
pub use error::{Result, VfsError};
#[cfg(feature = "native")]
pub use vfs::NativeVfs;
pub use vfs::{DirEntry, MemVfs, Metadata, PlannedOp, PreviewVfs, PreviewWrite, Vfs, normalize};
