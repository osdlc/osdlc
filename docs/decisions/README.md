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
| [D-L7N5](D-L7N5-host-cleaner.md)                         | Machine cleanup is a `host-cleaner` package over repo-cleaner, with optional detected adapters |
| [D-QMVA](D-QMVA-wayfinder-skill-handoff.md)              | wayfinder hands a skill to an agent CLI only when asked                                        |
| [D-SM4K](D-SM4K-markdown-ecosystem-home.md)              | The markdown ecosystem stays in this repository, flat in `packages/` for now                   |

Decisions about one package live in that package's
`docs/planning/decisions/`, such as
[repo-cleaner's](../../packages/ts/repo-cleaner/docs/planning/README.md).

Terms are defined in [../terms](../terms/README.md).
