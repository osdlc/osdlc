//! POSIX shell quoting, for showing a command line to a person and for fake
//! runner keys. Nothing here runs a shell.

/// Quotes one word for a POSIX shell. A non-empty word of only inert
/// characters stays bare; any other is single-quoted, with `'` written as
/// `'\''` and `\` as `'\\'`, outside the quotes, so that a shell that reads
/// backslash escapes inside single quotes, such as fish, sees a backslash.
pub fn shell_quote(word: &str) -> String {
    if !word.is_empty() && word.chars().all(is_inert) {
        word.to_string()
    } else {
        quoted(word)
    }
}

/// Joins `words` into one command line, quoting each. A first word holding
/// `=` is always quoted so a shell does not read it as an environment
/// assignment.
pub fn shell_join<S: AsRef<str>>(words: &[S]) -> String {
    words
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let w = w.as_ref();
            if i == 0 && w.contains('=') {
                quoted(w)
            } else {
                shell_quote(w)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_inert(c: char) -> bool {
    c.is_ascii_alphanumeric() || "_@%+=:,./-".contains(c)
}

fn quoted(word: &str) -> String {
    let mut out = String::with_capacity(word.len() + 2);
    out.push('\'');
    for c in word.chars() {
        match c {
            '\'' => out.push_str("'\\''"),
            '\\' => out.push_str("'\\\\'"),
            _ => out.push(c),
        }
    }
    out.push('\'');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_an_inert_word_bare() {
        assert_eq!(shell_quote("refs/heads/feat/x"), "refs/heads/feat/x");
        assert_eq!(
            shell_quote("--force-with-lease=refs/heads/a:0123"),
            "--force-with-lease=refs/heads/a:0123"
        );
    }

    #[test]
    fn quotes_spaces_quotes_and_the_empty_word() {
        assert_eq!(shell_quote("a b"), "'a b'");
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
        assert_eq!(shell_quote(""), "''");
        assert_eq!(shell_quote("$HOME"), "'$HOME'");
        assert_eq!(shell_quote("a\nb"), "'a\nb'");
        assert_eq!(shell_quote("é"), "'é'");
    }

    #[test]
    fn writes_a_backslash_outside_the_quotes() {
        assert_eq!(shell_quote("a\\b"), "'a'\\\\'b'");
        assert_eq!(shell_quote("hello\\"), "'hello'\\\\''");
    }

    #[test]
    fn join_quotes_an_assignment_looking_first_word() {
        assert_eq!(shell_join(&["a=b", "c=d"]), "'a=b' c=d");
        assert_eq!(shell_join::<&str>(&[]), "");
    }
}
