---
slug: cli/binary
category: cli
description: What command starts the harness, and how a program finds and checks it?
valueSchema:
  description: The command that starts the harness.
  type: object
  properties:
    supported:
      description: 'Whether the harness supports it: true, false, or "partial" where only part works.'
      type:
        - boolean
        - string
      enum:
        - true
        - false
        - partial
    name:
      description: The executable name as typed on the command line, such as claude.
      type: string
    aliases:
      description: Other executable names that start the same program.
      type: array
      items:
        type: string
    version_argv:
      description: The arguments that print the version, such as ["--version"].
      type: array
      items:
        type: string
    path_hint:
      description: Where the binary usually sits when it is not on PATH, starting with ~/.
      type: string
    subcommand:
      description: A subcommand needed for non-interactive use, such as exec.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

The name of the executable a program runs to start the harness, any other names it answers to, and how to confirm it is the right program (a version flag). A caller needs this before it can build any argv. It is distinct from the install subject, which says how the binary gets onto the machine.
