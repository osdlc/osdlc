# Decisions

One record per decision. A changed decision gets a new record that
supersedes the old one; records are not edited to reverse them. Ids are
random keys, so parallel branches do not collide.

| Id                                                       | Decision                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [D-YRKH](D-YRKH-one-implementation-per-vault-concept.md) | One implementation per vault concept                                               |
| [D-JPYM](D-JPYM-vfs-seam.md)                             | All file access goes through `vfs-seam`                                            |
| [D-DUFX](D-DUFX-vfs-walk-and-vault-layer.md)             | A general walk in `vfs-walk`, vault rules in `markdown-vault-fs`                   |
| [D-ODPP](D-ODPP-markdown-corpus.md)                      | `markdown-corpus` is the one corpus model                                          |
| [D-UVUH](D-UVUH-repo-cleaner-failed-lookups.md)          | In repo-cleaner, a failed lookup costs its evidence, a failed fetch the repository |

Terms are defined in [../terms](../terms/README.md).
