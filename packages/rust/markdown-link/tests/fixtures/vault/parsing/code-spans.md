# Code spans

Obsidian's cache records no references inside code. Exactly one link in this
note is real.

Real: [[glossary/terms/unique-term]].

```md
Fenced, and not a reference: [[fenced-should-not-resolve]]
```

Inline, and not a reference: `[[inline-should-not-resolve]]`.

Multi-byte inside code: `日本語` after.

~~~
Tilde-fenced. Obsidian harvests nothing here either: [[tilde-should-not-resolve]]
~~~

Double backticks, CommonMark's way to hold a literal backtick:
``a [[double-backtick-should-not-resolve]] b``.

- a list item, with an indented fence

    ```
    [[indented-fence-should-not-resolve]]
    ```
