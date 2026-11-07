# Decisions

One record per decision. A changed decision gets a new record that
supersedes the old one; records are not edited to reverse them. Ids are
random keys, so parallel branches do not collide.

| Id                                                       | Decision                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [D-YRKH](D-YRKH-one-implementation-per-vault-concept.md) | One implementation per vault concept                                                           |
| [D-JPYM](D-JPYM-vfs-seam.md)                             | All file access goes through `vfs-seam`                                                        |
| [D-DUFX](D-DUFX-vfs-walk-and-vault-layer.md)             | A general walk in `vfs-walk`, vault rules in `markdown-vault-fs`                               |
| [D-ODPP](D-ODPP-markdown-corpus.md)                      | `markdown-corpus` is the one corpus model                                                      |
| [D-RSWP](D-RSWP-repo-cleaner-standalone.md)              | repo-cleaner is a standalone tool; a host adds what it knows through `annotate`                |
| [D-L7N5](D-L7N5-host-cleaner.md)                         | Machine cleanup is a `host-cleaner` package over repo-cleaner, with optional detected adapters |

Terms are defined in [../terms](../terms/README.md).
