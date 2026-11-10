---
slug: config/config-dir-env
category: config
description: Which environment variable moves the harness's config directory?
valueSchema:
  description: The variable that relocates config.
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
    var:
      description: The variable name, such as CLAUDE_CONFIG_DIR.
      type: string
    replaces:
      description: The default directory it replaces, starting with ~/.
      type: string
    sets:
      description: "What lives under it: settings, skills, sessions, credentials."
      type: array
      items:
        type: string
    still_reads_home:
      description: Things still read from the home directory when it is set.
      type: array
      items:
        type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---

To isolate a run from the user's own settings, a caller points the harness at a scratch config directory. This subject records the variable, the directory it replaces and what still reads from the home directory.
