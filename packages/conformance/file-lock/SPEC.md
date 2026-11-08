# The file-lock protocol

Every implementation follows these rules, so that any of them can claim,
take over and release a lock that another wrote. "The lock" is a file at a
path the caller chooses, written here `x.lock`. Its existence means the lock
is held.

## The lock file

- Its text is a JSON object. A `token` field holds the claim's token: a
  random string, a v4 UUID in both implementations. The other fields are the
  holder's.
- Text that is not a JSON object, or whose `token` is not a string, is not
  lock content. A staleness rule still sees its age, but no token releases,
  touches or rewrites it.
- Text is read as UTF-8. Each byte sequence that is not UTF-8 reads as
  U+FFFD.
- The serialisation is free. Key order and whitespace may differ between
  implementations, because every comparison below is of the text one
  implementation read, against the text it reads again.

## Claim

1. Write the whole content, with a fresh `token` (replacing any `token` the
   caller gave), to `x.lock.new-<token>`.
2. Hard-link it to `x.lock`. Success means the lock is ours. "Already
   exists" means it is held: read it, and judge it with the caller's rule.
3. Remove `x.lock.new-<token>`, whatever happened.

A short section writes its claim file once and repeats step 2 until it wins
or times out.

## Takeover of a stale lock

A claimant that judged the lock, with text `D` and mtime `M`, to be stale:

1. Reads `x.lock` again. If its text is no longer exactly `D`, it stops and
   claims again.
2. Hard-links `x.lock` to the marker `x.lock.stale-<h>`, where `<h>` is the
   first 24 lowercase hex digits of the SHA-256 of `D`'s UTF-8 bytes. If the
   marker exists, another reaper holds it: a marker whose ctime is at least
   10 s old is a dead reaper's and is removed. Either way it stops and claims
   again.
3. Removes `x.lock` only if the marker and `x.lock` both still read exactly
   `D`, and `x.lock`'s mtime is still `M`.
4. Removes the marker, and claims again.

The marker name is part of the protocol: two implementations that judge one
stale lock contend for the same marker. A claim gives up after a bounded number of
rounds of claim and takeover (six in both implementations), and reports the
lock as held by no settled holder.

## Release, touch, update

Each acts only while `x.lock` holds the caller's token, and reports `false`
when the lock is gone or holds another token. Any other I/O error is an
error.

- **Release.** Read the token. If it is ours, rename `x.lock` to
  `x.lock.release-<uuid>`, check the token there, and remove it. If the
  token there is not ours (the lock was taken over in between), hard-link
  it back to `x.lock` first, unless a new claim already holds `x.lock`.
- **Touch.** Read the token. If it is ours, set the mtime to now.
- **Update.** Read the content. If its token is ours, write the new content,
  with our token, to `x.lock.new-<uuid>` and rename it over `x.lock`.

## Files

| File                    | Lifetime                    |
| ----------------------- | --------------------------- |
| `x.lock`                | while held                  |
| `x.lock.new-<uuid>`     | during a claim or an update |
| `x.lock.stale-<24 hex>` | during a takeover           |
| `x.lock.release-<uuid>` | during a release            |

## Limits

One machine, on a local file system with hard links. Windows is not tested:
the marker's age is read from its ctime on Unix only.
