# Terms

The words used for the shared corpus crates. One file per term. A term marked _planned_ comes from an accepted decision and is not built yet.

| Term                                        | Status            | Means                                                                           |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| [Corpus](corpus.md)                         | current           | A folder of markdown notes and the files they link to, read as one linked whole |
| [Vault](vault.md)                           | current           | A synonym for corpus                                                            |
| [Excluded files](excluded-files.md)         | current           | Paths a corpus marks to be left out of every tool's view                        |
| [markdown-db corpus](markdown-db-corpus.md) | current           | A corpus with a markdown-db root file, holding typed records as files           |
| [vfs-seam](vfs-seam.md)                     | current           | The crate holding the `Vfs` file-access trait and its backends                  |
| [vfs-walk](vfs-walk.md)                     | current           | The crate that walks a folder tree through `vfs-seam`, with no corpus rules     |
| [markdown-vault-fs](markdown-vault-fs.md)   | current, changing | The corpus layer over `vfs-walk`                                                |
| [markdown-corpus](markdown-corpus.md)       | current           | The crate that models a corpus                                                  |

Decisions are in [../decisions](../decisions/README.md).
