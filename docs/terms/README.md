# Terms

The words used for the shared vault crates. One file per term. A term marked _planned_ comes from an accepted decision and is not built yet.

| Term                                      | Status            | Means                                                                           |
| ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| [Vault](vault.md)                         | current           | A folder of markdown notes and the files they link to, read as one linked whole |
| [Excluded files](excluded-files.md)       | current           | Paths a vault marks to be left out of every tool's view                         |
| [vfs-seam](vfs-seam.md)                   | current           | The crate holding the `Vfs` file-access trait and its backends                  |
| [vfs-walk](vfs-walk.md)                   | current           | The crate that walks a folder tree through `vfs-seam`, with no vault rules      |
| [markdown-vault-fs](markdown-vault-fs.md) | current, changing | The vault layer over `vfs-walk`                                                 |
| [markdown-corpus](markdown-corpus.md)     | current           | The crate that models a corpus (a vault)                                        |

Decisions are in [../decisions](../decisions/README.md).
