# etag-write

Atomic file writes, sha256 etags and compare-and-swap for Rust.

A plain `fs::write` truncates the file and then writes it. A reader that opens
the file in between can see a truncated file, and a crash in between can leave
one on disk. When a person and a program edit the same file, a program that
writes without checking can also throw away whatever the person saved since the
program read it.

It is for programs that rewrite files that people or other programs also edit:
notes, config files, state files.

- `write_atomic` writes a temp file in the same directory, fsyncs it, renames
  it over the target and then fsyncs the directory (not on Windows, which
  cannot open a directory as a file).
- `write_cas` takes the etag you read and refuses the write if the file
  changed since then, or if the file exists and you sent no etag.
- `write_if_changed` skips the write when the bytes are the same, so file
  watchers and mtime-keyed caches are not woken for nothing.
- `etag` and `etag_of_file` give the lowercase hex sha256 of bytes or a file.

It works on bytes and paths only. It knows nothing about file formats.

## Install

```sh
cargo add etag-write
```

## Quick start

```rust
use etag_write::{WriteError, etag_of_file, write_cas};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("note.md");

    // Create: the file is absent and no etag is sent.
    write_cas(&path, b"first draft", None)?;

    // Read the etag, then write with it.
    let seen = etag_of_file(&path)?.expect("the file exists");
    write_cas(&path, b"second draft", Some(&seen))?;

    // Writing again with the old etag is refused: the file changed.
    match write_cas(&path, b"stale edit", Some(&seen)) {
        Err(WriteError::Conflict { .. }) => { /* re-read, merge, try again */ }
        other => panic!("expected a conflict, got {other:?}"),
    }
    Ok(())
}
```

The example uses the `tempfile` crate for a scratch directory; any path works.
It runs as a doc-test.

`examples/counter.rs` shows the full read, change, write and retry loop. Run
it with `cargo run --example counter`.

## What a reader and a crash see

These are the guarantees, and how far the tests go:

- Until the rename, the target keeps its old bytes, and the temp file already
  holds all of the new ones.
- The rename then swaps the name in one step. On a local POSIX file system,
  `rename` is atomic, so a reader that opens the path sees the old file or the
  new one. That last step is the operating system's guarantee. No test here can
  show it.
- If any step before the rename fails, the target is untouched and the temp
  file is removed. Parent directories the write created stay. A crash at that
  point also leaves the target untouched, but it can leave the temp file
  behind.
- The temp file is fsynced before the rename, and the directory after it
  (except on Windows, which skips the directory fsync), so that the new bytes
  and the rename survive a power cut. That depends on the
  operating system and the disk honouring fsync. No test covers it.

## The compare-and-swap rules

| on disk | etag sent | result |
|---|---|---|
| exists | matches | write |
| exists | differs | `WriteError::Conflict` |
| exists | none | `WriteError::ExistsWithoutEtag` |
| absent | none | create |
| absent | some | create (the file was deleted since it was read) |
| unreadable | any | `WriteError::Io`, never treated as absent |

`etag_of_file` follows the same rule: a missing file is `Ok(None)`, and any
other read error is an error.

## Behaviour to know

- **Permissions.** Overwriting a file keeps its permissions: the Unix `0o777`
  mode bits, or the read-only flag on Windows (untested: the tests have not
  run on Windows). The setuid, setgid and sticky bits are dropped, because
  the new file has a new owner. Owner and group are
  not copied. A new file gets the same mode `fs::write` would give it: `0o666`
  less the umask on Unix.
- **Temp files** are named `.<name>.etag-write-<pid>-<n>.tmp` in the target's
  directory. If a name is taken, the next `<n>` is tried, up to 65 names in all.
- **Parent directories** are created as needed.
- **Symlinks.** The rename replaces a symlink at the target path with a
  regular file. It does not write through the link. The new file takes the
  mode of the file the link pointed to.
- **The check and the write are not one step.** `write_cas` reads, compares
  and then renames. Another writer that lands in that short window is not
  detected. This narrows the race but does not close it. It is not a lock.

## Which test shows what

| Claim | Test |
|---|---|
| Target keeps its old bytes until the rename; temp file holds all the new ones | `the_target_keeps_its_old_bytes_until_the_rename` |
| A failed rename leaves the target untouched and no temp file (end to end) | `a_failure_before_the_rename_leaves_the_target_untouched`, `a_failed_rename_removes_the_temp_file` |
| A failed write, set-permissions or sync removes the temp file (through the guard: the guard is tested alone, and it is armed before those calls, but no test makes them fail) | `the_temp_guard_removes_its_file_unless_disarmed` |
| No temp file is left after a write | `atomic_write_creates_parents_and_leaves_no_temp_files` |
| Parent directories are created | `atomic_write_creates_parents_and_leaves_no_temp_files` |
| A bare name such as `x.md` is written in, and fsyncs, the current directory | `a_bare_name_is_written_in_the_current_directory`, `a_bare_name_lives_in_the_current_directory` |
| A parent path that is a file is an error | `a_parent_that_is_a_file_is_an_io_error` |
| Overwriting keeps the mode | `an_overwrite_keeps_the_old_file_mode` |
| Overwriting drops setuid | `an_overwrite_drops_the_setuid_bit` |
| A new file gets the `fs::write` mode | `a_new_file_gets_the_same_mode_as_fs_write` |
| A taken temp name moves on; all 65 taken is an error | `a_taken_temp_name_moves_on_to_the_next_attempt`, `every_temp_name_taken_is_an_io_error` |
| A symlink is replaced, not written through, and takes its target's mode | `a_symlink_at_the_target_is_replaced_not_written_through` |
| Compare-and-swap rules, rows 1 to 6 | `cas_rejects_a_stale_etag_and_accepts_a_fresh_one`, `cas_rejects_a_blind_overwrite`, `cas_creates_when_absent_and_no_etag_is_sent`, `cas_creates_when_the_file_was_deleted_under_us`, `cas_refuses_to_overwrite_an_unreadable_file` |
| `etag_of_file` on a missing and an unreadable file | `etag_of_file_is_none_for_a_missing_file`, `etag_of_file_is_an_error_for_an_unreadable_file` |
| `write_if_changed` skips identical bytes and leaves mtime alone | `write_if_changed_skips_identical_content` |
| An unreadable file is never replaced by `write_if_changed` | `write_if_changed_refuses_to_overwrite_an_unreadable_file` |
| Etags are lowercase hex sha256 | `etag_is_hex_sha256` |

The tests that need Unix modes or symlinks run on Unix only. Coverage is not
measured.

## Platforms

The code uses only the standard library, `sha2` and `thiserror`, and is written
for Linux, macOS and Windows. So far the tests have been run on macOS only. The
directory fsync is skipped where a directory cannot be opened as a file, which
is the case on Windows.

Minimum supported Rust version: 1.85, checked by running the tests on 1.85.

## When not to use it

- You need a lock, or several files changed together as one transaction.
- The file is on a network file system where `rename` is not atomic.
- The file is large and rewritten often. Every write copies the whole file
  and hashes it.
- You only need atomic replace with no etag check. `atomic-write-file` or
  `tempfile`'s `persist` are smaller.

## Compared with other crates

| | `etag-write` | `atomicwrites` | `atomic-write-file` | `tempfile` (`persist`) |
|---|---|---|---|---|
| Atomic replace via temp file and rename | yes | yes | yes | yes |
| Etag of a file (sha256) | yes | no | no | no |
| Refuses a write if the file changed since it was read | yes | no | no | no |
| Skips a write of identical bytes | yes | no | no | no |
| Write API | bytes in one call | closure over a `File` | `File`-like writer | write a `NamedTempFile`, then `persist` it |

This comparison is from each crate's documentation. Pick one of the others when
you stream a large file or only need atomic replace. Pick `etag-write` when more
than one writer edits the same file and a lost update matters.

## Stability

0.1 is the first release. The crate stays on 0.x for now. The six public items
(`etag`, `etag_of_file`, `write_atomic`, `write_cas`, `write_if_changed` and
`WriteError`) are each marked "stable in 0.x" in their docs: they are not
expected to change. `WriteError` is `#[non_exhaustive]`, so a later release can
add a variant without a breaking change.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
