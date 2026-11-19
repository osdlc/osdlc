//! The deterministic JSON encoding of a lease payload.

use serde_json::Value;

/// The deterministic JSON encoding of a value: equal values encode to equal
/// bytes, so equal payloads hash to the same git blob.
///
/// - Object keys are sorted by UTF-16 code unit, at every depth, as
///   `@osdlc/ref-lease` sorts them. (Rust's own order is by UTF-8 byte, which
///   differs for characters above U+FFFF.)
/// - No whitespace and no trailing newline.
/// - Strings are written as `JSON.stringify` writes them: non-ASCII characters
///   as UTF-8, control characters as `\u00xx`.
/// - Every number is written as the JavaScript number it parses to, in
///   JavaScript's shortest form: `1e+21`, `1.5`, and `0` for `-0`. An integer
///   above 2^53 loses the precision a JavaScript reader would lose.
#[must_use]
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    encode(value, &mut out);
    out
}

fn encode(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&js_number(n.as_f64().unwrap_or(f64::NAN))),
        Value::String(s) => push_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                encode(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                push_string(key, out);
                out.push(':');
                encode(&map[key], out);
            }
            out.push('}');
        }
    }
}

fn push_string(s: &str, out: &mut String) {
    // serde_json escapes `"`, `\`, and control characters as JSON.stringify does.
    out.push_str(&serde_json::to_string(s).expect("a string is always JSON"));
}

/// `Number.prototype.toString` for a finite number; `null` for NaN and
/// infinity, as `JSON.stringify` writes them.
fn js_number(x: f64) -> String {
    if !x.is_finite() {
        return "null".into();
    }
    if x == 0.0 {
        return "0".into();
    }
    // `{:e}` gives the shortest digits that round-trip: `d.ddde<exp>`.
    let sci = format!("{:e}", x.abs());
    let (mantissa, exp) = sci.split_once('e').expect("{:e} has an exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = i32::try_from(digits.len()).expect("a double has at most 17 digits");
    // The value is 0.<digits> * 10^n.
    let n = exp.parse::<i32>().expect("a decimal exponent") + 1;
    let body = if k <= n && n <= 21 {
        format!(
            "{digits}{}",
            "0".repeat(usize::try_from(n - k).expect("n >= k"))
        )
    } else if 0 < n && n <= 21 {
        let split = usize::try_from(n).expect("n > 0");
        format!("{}.{}", &digits[..split], &digits[split..])
    } else if -6 < n && n <= 0 {
        format!(
            "0.{}{digits}",
            "0".repeat(usize::try_from(-n).expect("n <= 0"))
        )
    } else {
        let e = n - 1;
        let sign = if e < 0 { '-' } else { '+' };
        let rest = if k == 1 {
            String::new()
        } else {
            format!(".{}", &digits[1..])
        };
        format!("{}{rest}e{sign}{}", &digits[..1], e.abs())
    };
    if x < 0.0 { format!("-{body}") } else { body }
}

#[cfg(test)]
mod tests {
    use super::canonical_json;

    #[test]
    fn negative_zero_is_written_as_zero() {
        let value = serde_json::from_str("[-0, -0.0]").expect("valid JSON");
        assert_eq!(canonical_json(&value), "[0,0]");
    }
}
