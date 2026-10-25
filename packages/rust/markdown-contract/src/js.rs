//! JavaScript string and number semantics the TS engine relies on.
//!
//! JS `\s`, `trim()` and `String(n)` differ from Rust's `char::is_whitespace`,
//! `str::trim` and `f64` display. Findings carry these values, so both engines use
//! the JS rules.

/// The characters JS `\s` matches (WhiteSpace plus LineTerminator). Unlike Rust's
/// `White_Space` it includes U+FEFF and excludes U+0085.
pub(crate) fn is_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// JS `\s` as a regex character class, for regex sources the engine builds.
pub(crate) const SPACE_CLASS: &str = r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

/// JS `s.trim()`.
pub(crate) fn trim(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// JS `s.replace(/\s+$/, '')`.
pub(crate) fn trim_end(s: &str) -> &str {
    s.trim_end_matches(is_space)
}

/// JS `s.split(/\s+/).filter(w => w.length > 0)`.
pub(crate) fn words(s: &str) -> impl Iterator<Item = &str> {
    s.split(is_space).filter(|w| !w.is_empty())
}

/// JS `String(n)`: `Infinity`, `NaN`, `0` for `-0`, and exponent form outside
/// `1e-7 < |n| < 1e21`.
pub(crate) fn num(n: f64) -> String {
    if n.is_nan() {
        return "NaN".into();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    if n == 0.0 {
        return "0".into();
    }
    // `{:e}` gives the shortest round-trip digits, as JS does: `d[.ddd]e<exp>`.
    let sci = format!("{:e}", n.abs());
    let (mantissa, exp) = sci.split_once('e').expect("{:e} has an exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let exp: i32 = exp.parse().expect("{:e} exponent is an integer");
    let k = digits.len() as i32;
    let point = exp + 1; // the decimal point sits after `point` digits
    let body = if k <= point && point <= 21 {
        format!("{digits}{}", "0".repeat((point - k) as usize))
    } else if 0 < point && point <= 21 {
        format!(
            "{}.{}",
            &digits[..point as usize],
            &digits[point as usize..]
        )
    } else if -6 < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let sign = if point - 1 < 0 { '-' } else { '+' };
        let rest = if k > 1 {
            format!("{}.{}", &digits[..1], &digits[1..])
        } else {
            digits
        };
        format!("{rest}e{sign}{}", (point - 1).abs())
    };
    if n < 0.0 { format!("-{body}") } else { body }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_print_as_js_string_does() {
        let cases = [
            (1.0, "1"),
            (1.5, "1.5"),
            (-0.0, "0"),
            (f64::INFINITY, "Infinity"),
            (f64::NEG_INFINITY, "-Infinity"),
            (f64::NAN, "NaN"),
            (2f64.powi(63), "9223372036854776000"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (123456789012345680000.0, "123456789012345680000"),
            (-12.25, "-12.25"),
            (1.25e-9, "1.25e-9"),
        ];
        for (n, js) in cases {
            assert_eq!(num(n), js, "String({n})");
        }
    }

    #[test]
    fn whitespace_is_js_whitespace() {
        assert!(is_space('\u{FEFF}'));
        assert!(!is_space('\u{85}'));
        assert_eq!(words("a\u{85}b c").count(), 2);
        assert_eq!(trim("\u{FEFF} x \u{A0}"), "x");
        let re = regex::Regex::new(SPACE_CLASS).unwrap();
        assert!(re.is_match("\u{FEFF}"));
        assert!(!re.is_match("\u{85}"));
    }
}
