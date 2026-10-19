//! An **ordered** YAML value model.
//!
//! Why not `serde_yaml::Value` or `serde_json::Value`? Because key order
//! matters here and neither type guarantees it: `serde_json::Map` is sorted
//! unless the `preserve_order` feature is on, and cargo feature unification
//! means any crate in a build can turn it on or leave it off. Key order is the
//! difference between a one-line diff and a reordered file, so it gets an
//! explicit type rather than a feature flag.
//!
//! The shape follows what a JavaScript value can be, because the emitter in
//! [`render`](crate::render) matches the npm `yaml` package (v2), whose input
//! is a JavaScript value. `Int` and `Float` are split (JavaScript has one
//! number type) so Rust callers do not have to pass integers through `f64`;
//! [`js_float_to_string`] formats a float the way JavaScript does.
//!
//! **Stability:** [`Value`] and [`Mapping`] are stable in 0.x.
//! [`js_float_to_string`] is unstable.

use std::fmt;

/// A YAML value, with mapping key order kept as inserted.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    /// `null`, `~` or an empty value.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// An integer that fits in an `i64`.
    Int(i64),
    /// Any other number, including `.nan` and `.inf`.
    Float(f64),
    /// A string.
    Str(String),
    /// A sequence.
    Seq(Vec<Value>),
    /// A mapping with string keys.
    Map(Mapping),
}

/// An insertion-ordered mapping with string keys.
///
/// A `Vec` rather than an `IndexMap`: frontmatter blocks are a handful of
/// keys, a linear scan is fast at that size, and the order guarantee is then
/// part of the type rather than a property of a dependency.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Mapping {
    entries: Vec<(String, Value)>,
}

impl Mapping {
    /// An empty mapping.
    pub fn new() -> Self {
        Mapping {
            entries: Vec::new(),
        }
    }

    /// The number of entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the mapping has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// The value at `key`, compared exactly.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Whether `key` is present, compared exactly.
    pub fn contains_key(&self, key: &str) -> bool {
        self.entries.iter().any(|(k, _)| k == key)
    }

    /// Inserts a new entry at the end, or overwrites an existing one in
    /// place. An overwritten key keeps its original position. Returns the old
    /// value, if there was one.
    pub fn insert(&mut self, key: impl Into<String>, value: Value) -> Option<Value> {
        let key = key.into();
        if let Some(slot) = self.entries.iter_mut().find(|(k, _)| *k == key) {
            return Some(std::mem::replace(&mut slot.1, value));
        }
        self.entries.push((key, value));
        None
    }

    /// Removes `key` and returns its value. The other entries keep their
    /// order.
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        let idx = self.entries.iter().position(|(k, _)| k == key)?;
        Some(self.entries.remove(idx).1)
    }

    /// The keys, in order.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|(k, _)| k.as_str())
    }

    /// The entries, in order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.entries.iter().map(|(k, v)| (k.as_str(), v))
    }
}

impl FromIterator<(String, Value)> for Mapping {
    fn from_iter<I: IntoIterator<Item = (String, Value)>>(iter: I) -> Self {
        let mut m = Mapping::new();
        for (k, v) in iter {
            m.insert(k, v);
        }
        m
    }
}

impl<'a> IntoIterator for &'a Mapping {
    type Item = (&'a str, &'a Value);
    type IntoIter = Box<dyn Iterator<Item = (&'a str, &'a Value)> + 'a>;
    fn into_iter(self) -> Self::IntoIter {
        Box::new(self.iter())
    }
}

impl Value {
    /// A new empty mapping.
    pub fn map() -> Value {
        Value::Map(Mapping::new())
    }

    /// The string, if this is a [`Value::Str`].
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    /// The mapping, if this is a [`Value::Map`].
    pub fn as_mapping(&self) -> Option<&Mapping> {
        match self {
            Value::Map(m) => Some(m),
            _ => None,
        }
    }

    /// The mapping, mutably, if this is a [`Value::Map`].
    pub fn as_mapping_mut(&mut self) -> Option<&mut Mapping> {
        match self {
            Value::Map(m) => Some(m),
            _ => None,
        }
    }

    /// The items, if this is a [`Value::Seq`].
    pub fn as_seq(&self) -> Option<&[Value]> {
        match self {
            Value::Seq(s) => Some(s),
            _ => None,
        }
    }

    /// Whether this is a sequence or a mapping.
    pub fn is_collection(&self) -> bool {
        matches!(self, Value::Seq(_) | Value::Map(_))
    }

    /// `true` when a collection has no items, the case the emitter writes in
    /// the flow forms `{}` and `[]` instead of as a block.
    pub fn is_empty_collection(&self) -> bool {
        match self {
            Value::Seq(s) => s.is_empty(),
            Value::Map(m) => m.is_empty(),
            _ => false,
        }
    }
}

impl From<&str> for Value {
    fn from(s: &str) -> Self {
        Value::Str(s.to_string())
    }
}
impl From<String> for Value {
    fn from(s: String) -> Self {
        Value::Str(s)
    }
}
impl From<bool> for Value {
    fn from(b: bool) -> Self {
        Value::Bool(b)
    }
}
impl From<i64> for Value {
    fn from(i: i64) -> Self {
        Value::Int(i)
    }
}
impl From<f64> for Value {
    fn from(f: f64) -> Self {
        Value::Float(f)
    }
}
impl<T: Into<Value>> From<Vec<T>> for Value {
    fn from(v: Vec<T>) -> Self {
        Value::Seq(v.into_iter().map(Into::into).collect())
    }
}
impl From<Mapping> for Value {
    fn from(m: Mapping) -> Self {
        Value::Map(m)
    }
}

/// Converts from a `serde_json` value.
///
/// A number that fits in an `i64` becomes [`Value::Int`]; any other number
/// becomes [`Value::Float`].
///
/// **Key order.** An object's keys come out in the order `serde_json::Map`
/// iterates them. That is sorted order unless the build turns on
/// `serde_json`'s `preserve_order` feature. To control the order of a
/// mapping you write, build it with [`Mapping::insert`].
///
/// Needs the `serde_json` feature, which is on by default.
#[cfg(feature = "serde_json")]
impl From<&serde_json::Value> for Value {
    fn from(v: &serde_json::Value) -> Self {
        match v {
            serde_json::Value::Null => Value::Null,
            serde_json::Value::Bool(b) => Value::Bool(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Value::Int(i)
                } else {
                    Value::Float(n.as_f64().unwrap_or(f64::NAN))
                }
            }
            serde_json::Value::String(s) => Value::Str(s.clone()),
            serde_json::Value::Array(a) => Value::Seq(a.iter().map(Value::from).collect()),
            serde_json::Value::Object(o) => {
                Value::Map(o.iter().map(|(k, v)| (k.clone(), Value::from(v))).collect())
            }
        }
    }
}

/// Formats a float the way the YAML emitter writes it: JavaScript's
/// `String(n)` (the ECMAScript `Number::toString` algorithm, base 10), with
/// YAML's `.nan`, `.inf` and `-.inf` for the values JSON cannot spell.
///
/// It differs from Rust's `Display` in two ways:
///
/// - Rust prints `1e21` as `1000000000000000000000`; JavaScript prints `1e+21`.
/// - Rust prints `2.5e-8` as `0.000000025`; JavaScript prints `2.5e-8`.
///
/// The switch to exponent form happens at decimal exponent `>= 21` and
/// `< -6`.
///
/// ```
/// use yaml_splice::value::js_float_to_string;
///
/// assert_eq!(js_float_to_string(1.0), "1");
/// assert_eq!(js_float_to_string(1e21), "1e+21");
/// assert_eq!(js_float_to_string(f64::NAN), ".nan");
/// ```
///
/// **Stability:** unstable.
///
/// # Panics
///
/// Does not panic. The two `expect` calls inside parse Rust's own `{:e}`
/// output, which always has an integer exponent.
pub fn js_float_to_string(f: f64) -> String {
    if f.is_nan() {
        return ".nan".to_string();
    }
    if f.is_infinite() {
        return if f < 0.0 { "-.inf" } else { ".inf" }.to_string();
    }
    if f == 0.0 {
        // `Object.is(value, -0)` is checked before JSON.stringify in
        // stringifyNumber, so negative zero survives as `-0`.
        return if f.is_sign_negative() { "-0" } else { "0" }.to_string();
    }

    // Rust's `{:e}` yields the SHORTEST round-tripping digit string, which is
    // the same digit sequence the ECMAScript spec's `k`/`s` pair names. Parse
    // it back apart rather than reimplementing Grisu.
    let sci = format!("{f:e}"); // e.g. "2.5e-8", "1e21", "-1.25e2"
    let (mantissa, exp) = sci.split_once('e').expect("{:e} always emits an exponent");
    let exp: i32 = exp.parse().expect("{:e} exponent is an integer");
    let negative = mantissa.starts_with('-');
    let mantissa = mantissa.trim_start_matches('-');
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let digits = digits.trim_end_matches('0');
    let digits = if digits.is_empty() { "0" } else { digits };

    let k = digits.len() as i32;
    // `{:e}` normalises to d.ddd, i.e. value = 0.digits * 10^(exp+1).
    let n = exp + 1;

    let body = if k <= n && n <= 21 {
        format!("{}{}", digits, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        let e = n - 1;
        let sign = if e >= 0 { "+" } else { "-" };
        if k == 1 {
            format!("{}e{}{}", digits, sign, e.abs())
        } else {
            format!("{}.{}e{}{}", &digits[..1], &digits[1..], sign, e.abs())
        }
    };

    if negative { format!("-{body}") } else { body }
}

impl fmt::Display for Value {
    /// For debugging only. Collections print as `[…]` and `{…}`. To write YAML,
    /// use [`render::render_value`](crate::render::render_value).
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Null => write!(f, "null"),
            Value::Bool(b) => write!(f, "{b}"),
            Value::Int(i) => write!(f, "{i}"),
            Value::Float(x) => write!(f, "{}", js_float_to_string(*x)),
            Value::Str(s) => write!(f, "{s}"),
            Value::Seq(_) => write!(f, "[…]"),
            Value::Map(_) => write!(f, "{{…}}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapping_overwrite_keeps_original_position() {
        let mut m = Mapping::new();
        m.insert("a", Value::Int(1));
        m.insert("b", Value::Int(2));
        m.insert("a", Value::Int(9));
        assert_eq!(m.keys().collect::<Vec<_>>(), vec!["a", "b"]);
        assert_eq!(m.get("a"), Some(&Value::Int(9)));
    }

    #[test]
    fn js_number_formatting_matches_the_yaml_package() {
        // Expected strings captured from the npm `yaml` package, version
        // 2.9.0, `stringify`.
        assert_eq!(js_float_to_string(1.0), "1");
        assert_eq!(js_float_to_string(100.0), "100");
        assert_eq!(js_float_to_string(-0.0), "-0");
        assert_eq!(js_float_to_string(1.5), "1.5");
        assert_eq!(js_float_to_string(2.5e-8), "2.5e-8");
        assert_eq!(js_float_to_string(1e21), "1e+21");
        assert_eq!(js_float_to_string(0.000001), "0.000001");
        assert_eq!(js_float_to_string(1e-7), "1e-7");
        assert_eq!(js_float_to_string(-7.0), "-7");
        assert_eq!(js_float_to_string(f64::NAN), ".nan");
        assert_eq!(js_float_to_string(f64::INFINITY), ".inf");
        assert_eq!(js_float_to_string(f64::NEG_INFINITY), "-.inf");
    }

    #[cfg(feature = "serde_json")]
    #[test]
    fn json_bridge_preserves_scalars() {
        let j: serde_json::Value = serde_json::json!({"a": 1, "b": [true, null, "x"]});
        let v = Value::from(&j);
        let m = v.as_mapping().unwrap();
        assert_eq!(m.get("a"), Some(&Value::Int(1)));
        assert_eq!(
            m.get("b").and_then(Value::as_seq),
            Some(&[Value::Bool(true), Value::Null, Value::Str("x".into())][..])
        );
    }
}
