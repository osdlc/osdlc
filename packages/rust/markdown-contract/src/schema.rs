//! The compiled schema runtime — the engine's stand-in for the Zod subset the closed
//! v1 vocabulary compiles to.
//!
//! A [`Schema`] validates one YAML-derived value (a frontmatter field, a table cell, a
//! list item) and reports [`Issue`]s whose [`IssueKind`]s mirror the Zod issue codes the
//! TS content plane maps to finding ids: `invalid_type`, `invalid_value` (enum/const),
//! `too_small` / `too_big`, `invalid_format` (pattern + named formats), and
//! `unrecognized_keys` (strict objects). The named [`StringFormat`]s replicate zod v4's
//! validators (`node_modules/zod/v4/core/regexes.js`) — regexes ported verbatim where
//! the `regex` crate allows, lookaheads hand-coded where it does not.
//!
//! Values are `serde_json::Value`s (the YAML → JS `toJS()` fidelity target); "undefined"
//! — a missing key — is modelled as `None`, distinct from JSON `null`.
//!
//! The YAML → [`Schema`] compiler lives in [`crate::declarative::schema_v2`] (the
//! JSON Schema subset); this module is the runtime only.

use regex::Regex;

// ── Path segments & issues (the Zod issue subset the planes consume) ─────────────────

/// One segment of an issue path — a mapping key or a sequence index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathSeg {
    /// a mapping key
    Key(String),
    /// a sequence index
    Index(usize),
}

impl std::fmt::Display for PathSeg {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathSeg::Key(k) => f.write_str(k),
            PathSeg::Index(i) => write!(f, "[{i}]"),
        }
    }
}

/// Render a path as a readable key reference: `[]` → `""`, `[a, b]` → `a.b`,
/// `[related, 0]` → `related[0]` — the TS `formatKeyPath`.
pub fn format_key_path(path: &[PathSeg]) -> String {
    let mut s = String::new();
    for seg in path {
        match seg {
            PathSeg::Index(i) => s.push_str(&format!("[{i}]")),
            PathSeg::Key(k) => {
                if !s.is_empty() {
                    s.push('.');
                }
                s.push_str(k);
            }
        }
    }
    s
}

/// The Zod issue codes the finding mapping distinguishes (`frontmatterIdFor` in the TS
/// content plane). `Custom` exists for completeness (`.refine()` is not expressible in
/// the v1 vocabulary, so the runtime never emits it).
#[derive(Debug, Clone, PartialEq)]
pub enum IssueKind {
    /// wrong JS type (also a missing required key — received `undefined`)
    InvalidType {
        /// the type that was expected
        expected: &'static str,
    },
    /// enum / const mismatch — `values` is the allowed set (one entry for a const)
    InvalidValue {
        /// the allowed values
        values: Vec<String>,
    },
    /// a string, number or array below its minimum
    TooSmall,
    /// a string, number or array above its maximum
    TooBig,
    /// a `pattern` (`format: "regex"`) or named-format violation
    InvalidFormat {
        /// the format that failed
        format: String,
    },
    /// a strict object rejecting unknown keys — all offenders in one issue
    UnrecognizedKeys {
        /// the keys that are not allowed
        keys: Vec<String>,
    },
}

/// One validation issue: where (`path`) and what (`kind`).
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    /// where the issue is, from the root
    pub path: Vec<PathSeg>,
    /// what is wrong
    pub kind: IssueKind,
}

// ── The schema model ──────────────────────────────────────────────────────────────────

/// A literal value for `const` (YAML scalars only).
#[derive(Debug, Clone, PartialEq)]
pub enum ConstValue {
    /// a string
    String(String),
    /// a number
    Number(f64),
    /// a boolean
    Bool(bool),
    /// null
    Null,
}

impl ConstValue {
    fn matches(&self, v: &serde_json::Value) -> bool {
        match (self, v) {
            (ConstValue::String(s), serde_json::Value::String(x)) => s == x,
            (ConstValue::Number(n), serde_json::Value::Number(x)) => {
                x.as_f64().is_some_and(|f| f == *n)
            }
            (ConstValue::Bool(b), serde_json::Value::Bool(x)) => b == x,
            (ConstValue::Null, serde_json::Value::Null) => true,
            _ => false,
        }
    }

    /// The value as it reads in a message / `values` list.
    pub fn render(&self) -> String {
        match self {
            ConstValue::String(s) => s.clone(),
            ConstValue::Number(n) => render_number(*n),
            ConstValue::Bool(b) => b.to_string(),
            ConstValue::Null => "null".into(),
        }
    }
}

/// Render a number the way JS `String(n)` does for the common cases (no trailing `.0`).
fn render_number(n: f64) -> String {
    if n.fract() == 0.0 && n.is_finite() && n.abs() < 1e21 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// One compiled schema node — the closed v1 vocabulary as runtime data.
#[derive(Debug, Clone)]
pub enum Schema {
    /// `type: string` with optional `min` / `max` (UTF-16 length) and `pattern`
    String {
        /// the shortest length
        min: Option<f64>,
        /// the longest length
        max: Option<f64>,
        /// a regular expression the string must match
        pattern: Option<Regex>,
    },
    /// `type: string` + `format: <name>` — a named zod string format. In v2
    /// the format COMPOSES with `minLength` / `maxLength` / `pattern` — the chained
    /// `z.email().min(…).regex(…)` — so the bounds and pattern ride along; v1 compiles
    /// the format alone (the other slots stay `None`).
    Format {
        /// the named format
        format: StringFormat,
        /// the shortest length
        min: Option<f64>,
        /// the longest length
        max: Option<f64>,
        /// a regular expression the string must match
        pattern: Option<Regex>,
    },
    /// `type: number` (`int: true` for integers) with optional `min` / `max`
    Number {
        /// whether only integers are allowed
        int: bool,
        /// the smallest value
        min: Option<f64>,
        /// the largest value
        max: Option<f64>,
    },
    /// `type: boolean`
    Boolean,
    /// `type: array` with an `of` element schema and optional `min` / `max` lengths
    Array {
        /// the schema for each element
        of: Box<Schema>,
        /// the fewest elements
        min: Option<f64>,
        /// the most elements
        max: Option<f64>,
    },
    /// `type: object` — `fields` in declaration order; `strict` rejects unknown keys
    Object {
        /// the fields, in declaration order
        fields: Vec<(String, Schema)>,
        /// whether unknown keys are rejected
        strict: bool,
    },
    /// `enum: [...]` — a closed set of strings
    Enum(Vec<String>),
    /// `const: <scalar>` — an exact literal
    Const(ConstValue),
    /// `nullable: true` — additionally admit `null`
    Nullable(Box<Schema>),
    /// `default: <value>` — a missing value passes (the default substitutes)
    Default(Box<Schema>),
    /// `optional: true` — a missing value passes
    Optional(Box<Schema>),
    /// a v2 `description:` — an annotation wrapper carried for `Finding.hint`;
    /// validation delegates to the inner schema untouched
    Described {
        /// the wrapped schema
        inner: Box<Schema>,
        /// the description text
        description: String,
    },
}

impl Schema {
    /// Validate `value` (`None` = the JS `undefined` — a missing key), collecting every
    /// issue — the Zod `safeParse` face: `Ok(())` on success, the issue list on failure.
    pub fn safe_parse(&self, value: Option<&serde_json::Value>) -> Result<(), Vec<Issue>> {
        let mut issues = Vec::new();
        check(self, value, &mut Vec::new(), &mut issues);
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}

// ── Description resolution (v2 `description:` → `Finding.hint`) ─────────────

/// Unwrap the annotation / value wrappers down to the structural node, recording the
/// deepest `description` passed on the way into `best`.
fn unwrap_describing<'a>(mut schema: &'a Schema, best: &mut Option<&'a str>) -> &'a Schema {
    loop {
        match schema {
            Schema::Described { inner, description } => {
                *best = Some(description);
                schema = inner;
            }
            Schema::Optional(inner) | Schema::Default(inner) | Schema::Nullable(inner) => {
                schema = inner;
            }
            other => return other,
        }
    }
}

/// The schema node's own `description`, if any (wrappers unwrapped) — the leaf-level
/// hint source for table cells and list items.
pub fn schema_root_description(schema: &Schema) -> Option<&str> {
    let mut best = None;
    unwrap_describing(schema, &mut best);
    best
}

/// The nearest enclosing `description` for an issue at `path`: walk the compiled schema
/// from the root along the path, and return the DEEPEST description seen (the failing
/// field's own, else its closest ancestor's). A path segment that does not resolve (an
/// unknown key on a strict object) stops the walk and keeps what was collected.
pub fn description_along_path<'a>(schema: &'a Schema, path: &[PathSeg]) -> Option<&'a str> {
    let mut best = None;
    let mut node = unwrap_describing(schema, &mut best);
    for seg in path {
        let next = match (node, seg) {
            (Schema::Object { fields, .. }, PathSeg::Key(k)) => {
                match fields.iter().find(|(key, _)| key == k) {
                    Some((_, field)) => field,
                    None => return best,
                }
            }
            (Schema::Array { of, .. }, PathSeg::Index(_)) => of,
            _ => return best,
        };
        node = unwrap_describing(next, &mut best);
    }
    best
}

/// The JS `typeof`-style type name of a value (distinguishing null and array from
/// object) — the TS `typeName`, with `None` as `undefined`.
pub fn type_name(v: Option<&serde_json::Value>) -> &'static str {
    match v {
        None => "undefined",
        Some(serde_json::Value::Null) => "null",
        Some(serde_json::Value::Bool(_)) => "boolean",
        Some(serde_json::Value::Number(_)) => "number",
        Some(serde_json::Value::String(_)) => "string",
        Some(serde_json::Value::Array(_)) => "array",
        Some(serde_json::Value::Object(_)) => "object",
    }
}

/// The UTF-16 length of a string — JS `.length`, which zod's string bounds measure.
fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn issue(issues: &mut Vec<Issue>, path: &[PathSeg], kind: IssueKind) {
    issues.push(Issue {
        path: path.to_vec(),
        kind,
    });
}

/// The recursive checker. Wrappers evaluate outside-in (`optional` admits a missing
/// value before `default`, before `nullable`, before the base — the TS wrapper order).
fn check(
    schema: &Schema,
    value: Option<&serde_json::Value>,
    path: &mut Vec<PathSeg>,
    issues: &mut Vec<Issue>,
) {
    match schema {
        Schema::Optional(inner) | Schema::Default(inner) => {
            if value.is_none() {
                return; // undefined passes (optional) / substitutes (default)
            }
            check(inner, value, path, issues);
        }
        Schema::Nullable(inner) => {
            if matches!(value, Some(serde_json::Value::Null)) {
                return;
            }
            check(inner, value, path, issues);
        }
        Schema::Described { inner, .. } => check(inner, value, path, issues),
        Schema::String { min, max, pattern } => {
            check_string(value, *min, *max, pattern.as_ref(), path, issues)
        }
        Schema::Format {
            format,
            min,
            max,
            pattern,
        } => check_format(value, format, *min, *max, pattern.as_ref(), path, issues),
        Schema::Number { int, min, max } => check_number(value, *int, *min, *max, path, issues),
        Schema::Boolean => {
            if !matches!(value, Some(serde_json::Value::Bool(_))) {
                issue(
                    issues,
                    path,
                    IssueKind::InvalidType {
                        expected: "boolean",
                    },
                );
            }
        }
        Schema::Array { of, min, max } => check_array(value, of, *min, *max, path, issues),
        Schema::Object { fields, strict } => check_object(value, fields, *strict, path, issues),
        Schema::Enum(options) => {
            let ok = matches!(value, Some(serde_json::Value::String(s)) if options.contains(s));
            if !ok {
                issue(
                    issues,
                    path,
                    IssueKind::InvalidValue {
                        values: options.clone(),
                    },
                );
            }
        }
        Schema::Const(c) => {
            let ok = value.is_some_and(|v| c.matches(v));
            if !ok {
                issue(
                    issues,
                    path,
                    IssueKind::InvalidValue {
                        values: vec![c.render()],
                    },
                );
            }
        }
    }
}

fn check_string(
    value: Option<&serde_json::Value>,
    min: Option<f64>,
    max: Option<f64>,
    pattern: Option<&Regex>,
    path: &[PathSeg],
    issues: &mut Vec<Issue>,
) {
    let Some(serde_json::Value::String(s)) = value else {
        issue(issues, path, IssueKind::InvalidType { expected: "string" });
        return;
    };
    let len = utf16_len(s) as f64;
    if let Some(min) = min
        && len < min
    {
        issue(issues, path, IssueKind::TooSmall);
    }
    if let Some(max) = max
        && len > max
    {
        issue(issues, path, IssueKind::TooBig);
    }
    if let Some(re) = pattern
        && !re.is_match(s)
    {
        issue(
            issues,
            path,
            IssueKind::InvalidFormat {
                format: "regex".into(),
            },
        );
    }
}

/// The named-format string check, with the v2 composed constraints chained after it in
/// zod's registration order (the format is the constructor's own check, then `.min()` /
/// `.max()` / `.regex()`): each violated constraint reports its own issue.
fn check_format(
    value: Option<&serde_json::Value>,
    format: &StringFormat,
    min: Option<f64>,
    max: Option<f64>,
    pattern: Option<&Regex>,
    path: &[PathSeg],
    issues: &mut Vec<Issue>,
) {
    let Some(serde_json::Value::String(s)) = value else {
        issue(issues, path, IssueKind::InvalidType { expected: "string" });
        return;
    };
    if !format.is_match(s) {
        issue(
            issues,
            path,
            IssueKind::InvalidFormat {
                format: format.name().into(),
            },
        );
    }
    let len = utf16_len(s) as f64;
    if let Some(min) = min
        && len < min
    {
        issue(issues, path, IssueKind::TooSmall);
    }
    if let Some(max) = max
        && len > max
    {
        issue(issues, path, IssueKind::TooBig);
    }
    if let Some(re) = pattern
        && !re.is_match(s)
    {
        issue(
            issues,
            path,
            IssueKind::InvalidFormat {
                format: "regex".into(),
            },
        );
    }
}

fn check_number(
    value: Option<&serde_json::Value>,
    int: bool,
    min: Option<f64>,
    max: Option<f64>,
    path: &[PathSeg],
    issues: &mut Vec<Issue>,
) {
    let n = match value {
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        _ => None,
    };
    let Some(n) = n else {
        issue(
            issues,
            path,
            IssueKind::InvalidType {
                expected: if int { "int" } else { "number" },
            },
        );
        return;
    };
    // zod's z.int() is a safe-integer gate (Number.isSafeInteger).
    if int && (n.fract() != 0.0 || n.abs() > 9_007_199_254_740_991.0) {
        issue(issues, path, IssueKind::InvalidType { expected: "int" });
        return;
    }
    if let Some(min) = min
        && n < min
    {
        issue(issues, path, IssueKind::TooSmall);
    }
    if let Some(max) = max
        && n > max
    {
        issue(issues, path, IssueKind::TooBig);
    }
}

fn check_array(
    value: Option<&serde_json::Value>,
    of: &Schema,
    min: Option<f64>,
    max: Option<f64>,
    path: &mut Vec<PathSeg>,
    issues: &mut Vec<Issue>,
) {
    let Some(serde_json::Value::Array(items)) = value else {
        issue(issues, path, IssueKind::InvalidType { expected: "array" });
        return;
    };
    let len = items.len() as f64;
    if let Some(min) = min
        && len < min
    {
        issue(issues, path, IssueKind::TooSmall);
    }
    if let Some(max) = max
        && len > max
    {
        issue(issues, path, IssueKind::TooBig);
    }
    for (i, item) in items.iter().enumerate() {
        path.push(PathSeg::Index(i));
        check(of, Some(item), path, issues);
        path.pop();
    }
}

fn check_object(
    value: Option<&serde_json::Value>,
    fields: &[(String, Schema)],
    strict: bool,
    path: &mut Vec<PathSeg>,
    issues: &mut Vec<Issue>,
) {
    let Some(serde_json::Value::Object(map)) = value else {
        issue(issues, path, IssueKind::InvalidType { expected: "object" });
        return;
    };
    // Declared fields first (declaration order), then the strict unknown-key sweep —
    // matching zod's issue emission order.
    for (key, schema) in fields {
        path.push(PathSeg::Key(key.clone()));
        check(schema, map.get(key), path, issues);
        path.pop();
    }
    if strict {
        let unknown: Vec<String> = map
            .keys()
            .filter(|k| !fields.iter().any(|(f, _)| f == *k))
            .cloned()
            .collect();
        if !unknown.is_empty() {
            issue(issues, path, IssueKind::UnrecognizedKeys { keys: unknown });
        }
    }
}

// ── Named string formats (zod v4 parity) ──────────────────────────────────────────────

/// The closed `format` vocabulary: the string formats zod exposes out of the
/// box, each replicating zod v4's validator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringFormat {
    // web / identity
    /// an email address
    Email,
    /// a URL
    Url,
    /// a UUID
    Uuid,
    /// a hostname
    Hostname,
    // ISO-8601 temporals
    /// an ISO-8601 date and time
    Datetime,
    /// an ISO-8601 date
    Date,
    /// an ISO-8601 time
    Time,
    /// an ISO-8601 duration
    Duration,
    // network
    /// an IPv4 address
    Ipv4,
    /// an IPv6 address
    Ipv6,
    /// an IPv4 CIDR range
    Cidrv4,
    /// an IPv6 CIDR range
    Cidrv6,
    // id forms
    /// a nanoid
    Nanoid,
    /// a cuid
    Cuid,
    /// a cuid2
    Cuid2,
    /// a ULID
    Ulid,
    // misc
    /// a base64 string
    Base64,
    /// an emoji
    Emoji,
    /// an E.164 phone number
    E164,
}

/// Every supported format, in the TS `STRING_FORMATS` declaration order (error messages
/// list them in this order).
pub const STRING_FORMATS: &[(&str, StringFormat)] = &[
    ("email", StringFormat::Email),
    ("url", StringFormat::Url),
    ("uuid", StringFormat::Uuid),
    ("hostname", StringFormat::Hostname),
    ("datetime", StringFormat::Datetime),
    ("date", StringFormat::Date),
    ("time", StringFormat::Time),
    ("duration", StringFormat::Duration),
    ("ipv4", StringFormat::Ipv4),
    ("ipv6", StringFormat::Ipv6),
    ("cidrv4", StringFormat::Cidrv4),
    ("cidrv6", StringFormat::Cidrv6),
    ("nanoid", StringFormat::Nanoid),
    ("cuid", StringFormat::Cuid),
    ("cuid2", StringFormat::Cuid2),
    ("ulid", StringFormat::Ulid),
    ("base64", StringFormat::Base64),
    ("emoji", StringFormat::Emoji),
    ("e164", StringFormat::E164),
];

impl StringFormat {
    /// The format's vocabulary name (also the zod issue's `format`).
    pub fn name(&self) -> &'static str {
        STRING_FORMATS
            .iter()
            .find(|(_, f)| f == self)
            .map(|(n, _)| *n)
            .expect("every format is named")
    }

    /// Parse a vocabulary name into its format.
    pub fn from_name(name: &str) -> Option<Self> {
        STRING_FORMATS
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, f)| *f)
    }

    /// Does `s` satisfy this format? Each arm replicates zod v4's validator
    /// (`v4/core/regexes.js`); lookaheads the `regex` crate lacks are hand-coded.
    pub fn is_match(&self, s: &str) -> bool {
        match self {
            StringFormat::Email => is_email(s),
            StringFormat::Url => is_url(s),
            StringFormat::Uuid => re(
                r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
            )
            .is_match(s),
            StringFormat::Hostname => is_hostname(s),
            StringFormat::Datetime => re(&format!(
                "^{DATE_SOURCE}T(?:{TIME_SOURCE}(?:Z))$"
            ))
            .is_match(s),
            StringFormat::Date => re(&format!("^{DATE_SOURCE}$")).is_match(s),
            StringFormat::Time => re(&format!("^{TIME_SOURCE}$")).is_match(s),
            StringFormat::Duration => is_duration(s),
            StringFormat::Ipv4 => re(
                r"^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$",
            )
            .is_match(s),
            StringFormat::Ipv6 => is_ipv6(s),
            StringFormat::Cidrv4 => re(
                r"^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])/([0-9]|[1-2][0-9]|3[0-2])$",
            )
            .is_match(s),
            StringFormat::Cidrv6 => is_cidrv6(s),
            StringFormat::Nanoid => re(r"^[a-zA-Z0-9_-]{21}$").is_match(s),
            StringFormat::Cuid => re(r"^[cC][0-9a-z]{6,}$").is_match(s),
            StringFormat::Cuid2 => re(r"^[0-9a-z]+$").is_match(s),
            StringFormat::Ulid => re(r"^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$").is_match(s),
            StringFormat::Base64 => re(
                r"^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$",
            )
            .is_match(s),
            StringFormat::Emoji => re(r"^(\p{Extended_Pictographic}|\p{Emoji_Component})+$")
                .is_match(s),
            StringFormat::E164 => re(r"^\+[1-9]\d{6,14}$").is_match(s),
        }
    }
}

/// zod's leap-year-aware ISO date source (ported verbatim).
const DATE_SOURCE: &str = r"(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))";

/// zod's default-precision time source: `hh:mm`, optional `:ss` and fraction.
const TIME_SOURCE: &str = r"(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?";

/// zod validates ipv6 by WHATWG-URL-parsing `http://[value]` — RFC 4291 textual forms
/// including `::` compression and embedded IPv4, which `std::net::Ipv6Addr` parses the
/// same way.
fn is_ipv6(s: &str) -> bool {
    s.parse::<std::net::Ipv6Addr>().is_ok()
}

/// zod's cidrv6 check (ported from `$ZodCIDRv6`): exactly one `/`, a canonical decimal
/// prefix 0–128 (`Number(prefix)` must round-trip), and a URL-parsable address.
fn is_cidrv6(s: &str) -> bool {
    let mut parts = s.split('/');
    let (Some(address), Some(prefix), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let canonical = prefix
        .parse::<u32>()
        .is_ok_and(|n| n <= 128 && n.to_string() == prefix);
    canonical && is_ipv6(address)
}

/// Compile a static regex source (all sources here are known-good; a failure is a bug).
fn re(source: &str) -> Regex {
    Regex::new(source).expect("static format regex compiles")
}

/// zod's practical email: `/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/`
/// — the two lookaheads (no leading dot, no `..`) hand-coded.
fn is_email(s: &str) -> bool {
    if s.starts_with('.') || s.contains("..") {
        return false;
    }
    re(r"^([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$")
        .is_match(s)
}

/// zod's `z.url()` accepts what the WHATWG `new URL(...)` constructor accepts. This is a
/// pragmatic approximation: an absolute URL with a scheme; the special schemes
/// (http/https/ws/wss/ftp/file) additionally follow WHATWG host rules.
fn is_url(s: &str) -> bool {
    let s = s.trim(); // WHATWG strips leading/trailing C0/space
    let Some(colon) = s.find(':') else {
        return false;
    };
    let scheme = &s[..colon];
    let mut chars = scheme.chars();
    let scheme_ok = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    if !scheme_ok {
        return false;
    }
    let rest = &s[colon + 1..];
    let special = matches!(
        scheme.to_ascii_lowercase().as_str(),
        "http" | "https" | "ws" | "wss" | "ftp" | "file"
    );
    if !special {
        return true; // a non-special scheme accepts any opaque path (e.g. mailto:x)
    }
    if scheme.eq_ignore_ascii_case("file") {
        return true; // file: accepts an empty host
    }
    // Special schemes need a non-empty host after `//` (WHATWG tolerates extra slashes).
    let after = rest.trim_start_matches(['/', '\\']);
    let host = after.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit('@').next().unwrap_or("");
    !host.is_empty() && !host.starts_with(':')
}

/// zod's hostname: `(?=.{1,253}\.?$)` length lookahead hand-coded, body verbatim.
fn is_hostname(s: &str) -> bool {
    let len = s.strip_suffix('.').unwrap_or(s).len();
    if len == 0 || len > 253 || s.is_empty() {
        return false;
    }
    re(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$").is_match(s)
}

/// zod's ISO-8601-1 duration:
/// `/^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/`
/// — the weeks-only branch, else the lookaheads hand-coded around the component regex.
fn is_duration(s: &str) -> bool {
    let Some(body) = s.strip_prefix('P') else {
        return false;
    };
    if re(r"^\d+W$").is_match(body) {
        return true;
    }
    // (?!.*W): no W in the non-week form; (?=\d|T\d): at least one leading component.
    if body.contains('W') || !re(r"^(?:\d|T\d)").is_match(body) {
        return false;
    }
    re(r"^(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?$").is_match(body)
        // (?=\d) after T: a bare trailing `T` is invalid.
        && !body.ends_with('T')
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn kinds(schema: &Schema, v: &serde_json::Value) -> Vec<Issue> {
        schema.safe_parse(Some(v)).err().unwrap_or_default()
    }

    // Contract first: a string schema accepts a string and reports the exact issue
    // stream Zod would — type, bounds, pattern — each addressed to its path.
    #[test]
    fn string_type_bounds_and_pattern() {
        let s = Schema::String {
            min: Some(2.0),
            max: Some(4.0),
            pattern: Some(Regex::new("^a").unwrap()),
        };
        assert!(s.safe_parse(Some(&json!("abc"))).is_ok());
        assert_eq!(
            kinds(&s, &json!(7))[0].kind,
            IssueKind::InvalidType { expected: "string" }
        );
        assert_eq!(kinds(&s, &json!("a"))[0].kind, IssueKind::TooSmall);
        assert_eq!(kinds(&s, &json!("aaaaa"))[0].kind, IssueKind::TooBig);
        assert_eq!(
            kinds(&s, &json!("bc"))[0].kind,
            IssueKind::InvalidFormat {
                format: "regex".into()
            }
        );
    }

    #[test]
    fn enum_and_const_report_invalid_value() {
        let e = Schema::Enum(vec!["a".into(), "b".into()]);
        assert!(e.safe_parse(Some(&json!("a"))).is_ok());
        assert_eq!(
            kinds(&e, &json!("c"))[0].kind,
            IssueKind::InvalidValue {
                values: vec!["a".into(), "b".into()]
            }
        );
        let c = Schema::Const(ConstValue::Number(3.0));
        assert!(c.safe_parse(Some(&json!(3))).is_ok());
        assert!(c.safe_parse(Some(&json!(4))).is_err());
    }

    #[test]
    fn strict_object_reports_missing_required_and_unknown_keys() {
        let o = Schema::Object {
            fields: vec![(
                "id".into(),
                Schema::String {
                    min: None,
                    max: None,
                    pattern: None,
                },
            )],
            strict: true,
        };
        let issues = kinds(&o, &json!({"extra": 1}));
        assert_eq!(
            issues[0],
            Issue {
                path: vec![PathSeg::Key("id".into())],
                kind: IssueKind::InvalidType { expected: "string" }
            }
        );
        assert_eq!(
            issues[1],
            Issue {
                path: vec![],
                kind: IssueKind::UnrecognizedKeys {
                    keys: vec!["extra".into()]
                }
            }
        );
    }

    #[test]
    fn wrappers_admit_missing_null_and_defaulted_values() {
        let base = || Box::new(Schema::Boolean);
        assert!(Schema::Optional(base()).safe_parse(None).is_ok());
        assert!(Schema::Default(base()).safe_parse(None).is_ok());
        assert!(
            Schema::Nullable(base())
                .safe_parse(Some(&json!(null)))
                .is_ok()
        );
        // A required (unwrapped) schema rejects a missing value as invalid_type.
        assert_eq!(
            Schema::Boolean.safe_parse(None).unwrap_err()[0].kind,
            IssueKind::InvalidType {
                expected: "boolean"
            }
        );
    }

    #[test]
    fn array_recurses_with_index_paths() {
        let a = Schema::Array {
            of: Box::new(Schema::String {
                min: None,
                max: None,
                pattern: None,
            }),
            min: Some(1.0),
            max: None,
        };
        assert!(a.safe_parse(Some(&json!(["x"]))).is_ok());
        assert_eq!(kinds(&a, &json!([]))[0].kind, IssueKind::TooSmall);
        let issues = kinds(&a, &json!(["ok", 5]));
        assert_eq!(issues[0].path, vec![PathSeg::Index(1)]);
    }

    #[test]
    fn number_int_is_a_safe_integer_gate() {
        let n = Schema::Number {
            int: true,
            min: Some(0.0),
            max: Some(10.0),
        };
        assert!(n.safe_parse(Some(&json!(5))).is_ok());
        assert_eq!(
            kinds(&n, &json!(1.5))[0].kind,
            IssueKind::InvalidType { expected: "int" }
        );
        assert_eq!(kinds(&n, &json!(-1))[0].kind, IssueKind::TooSmall);
        assert_eq!(kinds(&n, &json!(11))[0].kind, IssueKind::TooBig);
    }

    // ── Formats: zod v4 parity spot checks (precise for date/datetime/email/url/uuid) ──

    #[test]
    fn date_format_is_leap_year_aware() {
        let f = StringFormat::Date;
        assert!(f.is_match("2024-02-29")); // leap year
        assert!(!f.is_match("2023-02-29"));
        assert!(f.is_match("2023-12-31"));
        assert!(!f.is_match("2023-13-01"));
        assert!(!f.is_match("2023-04-31"));
    }

    #[test]
    fn datetime_requires_utc_z_and_allows_optional_seconds() {
        let f = StringFormat::Datetime;
        assert!(f.is_match("2024-01-02T03:04:05Z"));
        assert!(f.is_match("2024-01-02T03:04Z")); // seconds optional (zod v4 default)
        assert!(f.is_match("2024-01-02T03:04:05.123Z"));
        assert!(!f.is_match("2024-01-02T03:04:05")); // no offset → Z required
        assert!(!f.is_match("2024-01-02T03:04:05+02:00")); // offset off by default
        assert!(!f.is_match("2024-01-02 03:04:05Z"));
    }

    #[test]
    fn email_matches_zods_practical_regex() {
        let f = StringFormat::Email;
        assert!(f.is_match("a.b+c@example.co"));
        assert!(!f.is_match(".lead@example.com")); // (?!\.)
        assert!(!f.is_match("a..b@example.com")); // (?!.*\.\.)
        assert!(!f.is_match("a@example"));
        assert!(!f.is_match("a b@example.com"));
    }

    #[test]
    fn url_accepts_whatwg_parsable_urls() {
        let f = StringFormat::Url;
        assert!(f.is_match("https://example.com/path?q=1"));
        assert!(f.is_match("mailto:user@example.com")); // non-special scheme
        assert!(!f.is_match("example.com")); // no scheme
        assert!(!f.is_match("http://")); // special scheme, empty host
    }

    #[test]
    fn uuid_admits_versions_1_to_8_plus_nil_and_max() {
        let f = StringFormat::Uuid;
        assert!(f.is_match("6ba7b810-9dad-11d1-80b4-00c04fd430c8"));
        assert!(f.is_match("00000000-0000-0000-0000-000000000000"));
        assert!(!f.is_match("6ba7b810-9dad-01d1-80b4-00c04fd430c8")); // version 0
        assert!(!f.is_match("6ba7b810-9dad-11d1-c0b4-00c04fd430c8")); // bad variant
    }

    #[test]
    fn remaining_formats_spot_checks() {
        assert!(StringFormat::Time.is_match("23:59:59.999"));
        assert!(!StringFormat::Time.is_match("24:00"));
        assert!(StringFormat::Duration.is_match("P3Y6M4DT12H30M5S"));
        assert!(StringFormat::Duration.is_match("P4W"));
        assert!(!StringFormat::Duration.is_match("P4WT1H")); // weeks don't mix (8601-1)
        assert!(!StringFormat::Duration.is_match("P1YT")); // bare trailing T
        assert!(StringFormat::Ipv4.is_match("192.168.0.1"));
        assert!(!StringFormat::Ipv4.is_match("256.0.0.1"));
        assert!(StringFormat::Ipv6.is_match("2001:db8::1"));
        assert!(StringFormat::Ipv6.is_match("::ffff:192.0.2.1")); // embedded v4
        assert!(!StringFormat::Ipv6.is_match("2001:db8"));
        assert!(StringFormat::Cidrv4.is_match("10.0.0.0/8"));
        assert!(StringFormat::Cidrv6.is_match("2001:db8::/32"));
        assert!(!StringFormat::Cidrv6.is_match("2001:db8::/032")); // non-canonical prefix
        assert!(!StringFormat::Cidrv6.is_match("2001:db8::/129"));
        assert!(StringFormat::Hostname.is_match("sub.example-1.com"));
        assert!(!StringFormat::Hostname.is_match("-bad.com"));
        assert!(StringFormat::Nanoid.is_match("V1StGXR8_Z5jdHi6B-myT"));
        assert!(StringFormat::Cuid.is_match("cjld2cjxh0000qzrmn831i7rn"));
        assert!(StringFormat::Cuid2.is_match("tz4a98xxat96iws9zmbrgj3a"));
        assert!(StringFormat::Ulid.is_match("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
        assert!(StringFormat::Base64.is_match("aGVsbG8="));
        assert!(!StringFormat::Base64.is_match("aGVsbG8"));
        assert!(StringFormat::E164.is_match("+14155550132"));
        assert!(!StringFormat::E164.is_match("+04155550132"));
        assert!(StringFormat::Emoji.is_match("🎉"));
        assert!(!StringFormat::Emoji.is_match("x"));
    }

    // v2 composition: one string schema carries a named format AND bounds AND
    // a pattern; every violated constraint reports its own issue, in zod's chained order.
    #[test]
    fn format_composes_with_bounds_and_pattern() {
        let s = Schema::Format {
            format: StringFormat::Email,
            min: Some(30.0),
            max: None,
            pattern: Some(Regex::new("^ops-").unwrap()),
        };
        assert!(
            s.safe_parse(Some(&json!("ops-team+alerts@example-corp.com")))
                .is_ok()
        );
        let issues = kinds(&s, &json!("not an email"));
        assert_eq!(
            issues.iter().map(|i| i.kind.clone()).collect::<Vec<_>>(),
            vec![
                IssueKind::InvalidFormat {
                    format: "email".into()
                },
                IssueKind::TooSmall,
                IssueKind::InvalidFormat {
                    format: "regex".into()
                },
            ]
        );
        // A valid email that only breaks one chained constraint reports only that one.
        assert_eq!(
            kinds(&s, &json!("ops-abcdefghijklmnop@example.com")),
            vec![]
        );
    }

    // v2 `description`: the wrapper is validation-transparent, and the walk
    // resolves the nearest enclosing description along an issue path.
    #[test]
    fn described_delegates_and_resolves_along_paths() {
        let field = Schema::Described {
            inner: Box::new(Schema::Boolean),
            description: "the field".into(),
        };
        assert!(field.safe_parse(Some(&json!(true))).is_ok());
        assert!(field.safe_parse(Some(&json!(1))).is_err());

        let root = Schema::Described {
            inner: Box::new(Schema::Object {
                fields: vec![
                    ("flag".into(), field),
                    ("bare".into(), Schema::Boolean),
                    (
                        "items".into(),
                        Schema::Array {
                            of: Box::new(Schema::Described {
                                inner: Box::new(Schema::Boolean),
                                description: "each item".into(),
                            }),
                            min: None,
                            max: None,
                        },
                    ),
                ],
                strict: true,
            }),
            description: "the root".into(),
        };
        let key = |k: &str| PathSeg::Key(k.to_string());
        // Nearest wins: the field's own description beats the root's.
        assert_eq!(
            description_along_path(&root, &[key("flag")]),
            Some("the field")
        );
        // No field description → the enclosing root's.
        assert_eq!(
            description_along_path(&root, &[key("bare")]),
            Some("the root")
        );
        assert_eq!(
            description_along_path(&root, &[key("items"), PathSeg::Index(0)]),
            Some("each item")
        );
        // An unresolvable tail (unknown key) keeps what the walk collected.
        assert_eq!(
            description_along_path(&root, &[key("nope")]),
            Some("the root")
        );
        assert_eq!(schema_root_description(&root), Some("the root"));
        assert_eq!(schema_root_description(&Schema::Boolean), None);
    }

    #[test]
    fn format_key_path_renders_keys_and_indices() {
        assert_eq!(format_key_path(&[]), "");
        assert_eq!(
            format_key_path(&[PathSeg::Key("a".into()), PathSeg::Key("b".into())]),
            "a.b"
        );
        assert_eq!(
            format_key_path(&[PathSeg::Key("related".into()), PathSeg::Index(0)]),
            "related[0]"
        );
    }
}
