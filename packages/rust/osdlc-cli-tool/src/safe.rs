//! Text from outside the tool (a file's keys, a path, a message) made safe to
//! print on a terminal.

/// `text` with every terminal control removed except line feeds and tabs, so
/// printing it cannot move the cursor, recolor the terminal or set its title.
///
/// Whole escape sequences go: CSI (`ESC [` or `U+009B`) through its final
/// byte, OSC (`ESC ]` or `U+009D`) through BEL, the string terminator or
/// another escape, and any other escape with its intermediates (`U+0020` to
/// `U+002F`) and final character, such as `ESC c` or the `ESC ( B` of xterm's
/// `tput sgr0`. A sequence stops before a line feed, and an escape just before
/// a control goes alone. Every other C0, DEL and C1 control is dropped.
pub fn safe(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\n' | '\t' => out.push(c),
            '\u{1b}' => match chars.peek() {
                Some('[') => {
                    chars.next();
                    skip_csi(&mut chars);
                }
                Some(']') => {
                    chars.next();
                    skip_string(&mut chars);
                }
                Some(c) if !c.is_control() => {
                    while chars
                        .next_if(|c| ('\u{20}'..='\u{2f}').contains(c))
                        .is_some()
                    {}
                    chars.next_if(|c| !c.is_control());
                }
                // Only the escape goes; a control after it is read next turn.
                _ => {}
            },
            '\u{9b}' => skip_csi(&mut chars),
            '\u{9d}' => skip_string(&mut chars),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
}

/// [`safe`] for text that must stay on one line (a list entry, a value in
/// brackets): line feeds and tabs show as `\n` and `\t` instead of breaking
/// the line.
pub fn safe_line(text: &str) -> String {
    // Cleaned first: once line feeds and tabs are escaped, an unfinished CSI
    // would end on the `\` and an unfinished OSC would run on past a line end.
    safe(text).replace('\n', "\\n").replace('\t', "\\t")
}

/// Skip parameter and intermediate bytes through the final byte (`@`..`~`),
/// or up to a line feed when there is none before it.
fn skip_csi(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    while let Some(c) = chars.next_if(|c| *c != '\n') {
        if ('\u{40}'..='\u{7e}').contains(&c) {
            break;
        }
    }
}

/// Skip a string sequence through BEL, `U+009C` or an escape (with the `\` of
/// `ESC \`), or up to a line feed when it has no terminator before it.
fn skip_string(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    while let Some(c) = chars.next_if(|c| *c != '\n') {
        match c {
            '\u{7}' | '\u{9c}' => break,
            '\u{1b}' => {
                chars.next_if_eq(&'\\');
                break;
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_csi_in_both_forms_and_keeps_tab_and_newline() {
        assert_eq!(safe("a\u{1b}[2Jb\u{9b}31mc\td\ne"), "abc\td\ne");
    }

    #[test]
    fn removes_osc_titles() {
        assert_eq!(safe("no \u{1b}]0;pwned\u{7}x."), "no x.");
        assert_eq!(safe("a\u{1b}]0;t\u{1b}\\b"), "ab");
    }

    #[test]
    fn an_unfinished_sequence_stops_at_the_end_of_its_line() {
        assert_eq!(safe("a\u{1b}]0;title\nb"), "a\nb");
        assert_eq!(safe("a\u{9d}title\nb\u{7}c"), "a\nbc");
        assert_eq!(safe("a\u{1b}[31\nb"), "a\nb");
        assert_eq!(safe("a\u{9b}31\n\tb"), "a\n\tb");
        // With no line end after it, it runs to the end of the text.
        assert_eq!(safe("a\u{1b}]0;title"), "a");
    }

    #[test]
    fn an_escape_before_a_control_goes_by_itself() {
        assert_eq!(safe("line1 \u{1b}\nline2"), "line1 \nline2");
        assert_eq!(safe("a\u{1b}\tb"), "a\tb");
        // The second escape still opens its own sequence.
        assert_eq!(safe("a\u{1b}\u{1b}[31mb"), "ab");
        assert_eq!(safe("a\u{1b}\u{9b}31mb"), "ab");
        assert_eq!(safe("a\u{1b}\u{7}b"), "ab");
        assert_eq!(safe("a\u{1b}"), "a");
    }

    #[test]
    fn a_two_character_escape_goes_whole() {
        assert_eq!(safe("a\u{1b}cb"), "ab");
        assert_eq!(safe("a\u{1b}7b\u{1b}8c"), "abc");
    }

    #[test]
    fn an_escape_with_intermediates_goes_whole() {
        assert_eq!(safe("a\u{1b}(Bb"), "ab");
        assert_eq!(safe("a\u{1b}#8b"), "ab");
        assert_eq!(safe("a\u{1b} Fb"), "ab");
        // No final character before the line ends: the line feed stays.
        assert_eq!(safe("a\u{1b}(\nb"), "a\nb");
        assert_eq!(safe("a\u{1b}("), "a");
    }

    #[test]
    fn leaves_plain_text_alone() {
        assert_eq!(safe("héllo wörld"), "héllo wörld");
    }

    #[test]
    fn safe_line_escapes_line_breaks() {
        assert_eq!(safe_line("a\nb\tc\u{1b}[1m"), "a\\nb\\tc");
    }

    #[test]
    fn safe_line_keeps_the_line_break_an_unfinished_sequence_stops_at() {
        assert_eq!(safe_line("a\u{1b}[31\nb"), "a\\nb");
        assert_eq!(safe_line("a\u{1b}]0;t\nb"), "a\\nb");
        assert_eq!(safe_line("a\u{1b}\nb\u{1b}\tc"), "a\\nb\\tc");
    }
}
