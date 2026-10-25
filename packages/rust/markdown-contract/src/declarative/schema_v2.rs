//! The v2 schema-node compiler — the JSON Schema 2020-12 subset of `mcVersion: 2`:
//! YAML mapping in, a compiled [`Schema`] out, mirroring the
//! TS v2 `compileSchemaV2`.
//!
//! The vocabulary is the JSON Schema idiom compiled to the same runtime targets v1
//! hits: `properties` / `required` (optional-by-default — the JSON Schema inversion of
//! v1's implicit-required) / `additionalProperties`, `minLength`–`maxLength` /
//! `minimum`–`maximum` / `minItems`–`maxItems`, `items`, `type: integer`, the null
//! union `type: [T, "null"]`, and a `format` that now COMPOSES with bounds and
//! `pattern` (the Zod-chained constructor). `description` is stored on every node for
//! `Finding.hint`.
//!
//! Every node is checked against its type's allowed-key set (closing v1's silent-ignore
//! hole) with three rejection classes: a v1 spelling gets a migration hint, recognized
//! JSON Schema outside the subset is named as such (the seam full 2020-12 support would
//! later slot into), and anything else is an unknown key.

use regex::Regex;
use serde_yaml::Value;

use super::errors::DeclarativeError;
use crate::schema::{ConstValue, STRING_FORMATS, Schema, StringFormat};

/// A human word for a YAML value's shape, for error messages (the TS `describe`).
fn describe(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Sequence(_) => "a list",
        Value::Mapping(_) => "object",
        Value::String(_) => "string",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        Value::Tagged(_) => "a tagged value",
    }
}

fn get<'a>(map: &'a serde_yaml::Mapping, key: &str) -> Option<&'a Value> {
    map.get(Value::String(key.into()))
}

fn err(msg: String) -> DeclarativeError {
    DeclarativeError::InvalidSchema(msg)
}

/// A number-or-`None` reader for the optional bound knobs (a non-number is silently
/// ignored, as in the v1 `num`).
fn num(map: &serde_yaml::Mapping, key: &str) -> Option<f64> {
    get(map, key).and_then(Value::as_f64)
}

// ── The per-node allowed-key check (three rejection classes) ─────────────────────────

/// The v1 spellings and their v2 counterparts — class (a): the migration hint.
const V1_SPELLINGS: &[(&str, &str)] = &[
    ("fields", "'properties'"),
    ("of", "'items'"),
    ("strict", "'additionalProperties: false'"),
    ("int", "'type: integer'"),
    ("nullable", "'type: [T, \"null\"]'"),
    (
        "optional",
        "'required' (a property is optional unless listed there)",
    ),
    (
        "min",
        "'minLength' (string), 'minimum' (number), or 'minItems' (array)",
    ),
    (
        "max",
        "'maxLength' (string), 'maximum' (number), or 'maxItems' (array)",
    ),
];

/// Recognized JSON Schema keywords outside the supported v2 subset — class (b): the
/// seam a later full-2020-12 evaluator slots into.
const OUTSIDE_SUBSET: &[&str] = &[
    "oneOf",
    "anyOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
    "$ref",
    "$defs",
    "$id",
    "$schema",
    "$comment",
    "prefixItems",
    "contains",
    "minContains",
    "maxContains",
    "uniqueItems",
    "patternProperties",
    "propertyNames",
    "minProperties",
    "maxProperties",
    "dependentRequired",
    "dependentSchemas",
    "multipleOf",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "unevaluatedProperties",
    "unevaluatedItems",
    "contentEncoding",
    "contentMediaType",
    "title",
    "examples",
    "deprecated",
    "readOnly",
    "writeOnly",
];

/// Reject every key of `n` outside `allowed`: a v1 spelling → the migration hint,
/// recognized JSON Schema outside the subset → named as such, else an unknown key.
fn check_keys(
    n: &serde_yaml::Mapping,
    allowed: &[&str],
    path: &str,
) -> Result<(), DeclarativeError> {
    for key in n.keys() {
        let Some(k) = key.as_str() else {
            return Err(err(format!("{path}: schema keys must be strings")));
        };
        if allowed.contains(&k) {
            continue;
        }
        if let Some((_, v2)) = V1_SPELLINGS.iter().find(|(v1, _)| *v1 == k) {
            return Err(err(format!(
                "{path}: '{k}' is the v1 spelling — mcVersion 2 uses {v2}"
            )));
        }
        if OUTSIDE_SUBSET.contains(&k) {
            return Err(err(format!(
                "{path}: '{k}' is JSON Schema outside the supported v2 subset"
            )));
        }
        return Err(err(format!("{path}: unknown key '{k}'")));
    }
    Ok(())
}

// ── The node compiler ─────────────────────────────────────────────────────────────────

/// Compile one v2 schema node (the JSON Schema subset) into a [`Schema`].
pub fn compile_schema_v2(node: &Value, path: &str) -> Result<Schema, DeclarativeError> {
    let Value::Mapping(n) = node else {
        return Err(err(format!(
            "{path}: a schema must be a mapping (got {})",
            describe(node)
        )));
    };

    // Exactly one of type / enum / const supplies the base.
    let bases: Vec<&str> = ["type", "enum", "const"]
        .into_iter()
        .filter(|k| get(n, k).is_some())
        .collect();
    if bases.len() != 1 {
        return Err(err(format!(
            "{path}: a schema needs exactly one of type / enum / const"
        )));
    }

    let mut schema = match bases[0] {
        "enum" => {
            check_keys(n, &["enum", "description", "default"], path)?;
            compile_enum(n, path)?
        }
        "const" => {
            check_keys(n, &["const", "description", "default"], path)?;
            compile_const(n, path)?
        }
        _ => compile_typed(n, path)?,
    };

    // Wrappers outward: (nullable is applied by `compile_typed` for the null union),
    // then `default`, then the stored `description`.
    if get(n, "default").is_some() {
        schema = Schema::Default(Box::new(schema));
    }
    if let Some(description) = description_of(n, path)? {
        schema = Schema::Described {
            inner: Box::new(schema),
            description,
        };
    }
    Ok(schema)
}

/// The `description:` annotation — a string, stored for `Finding.hint`.
fn description_of(n: &serde_yaml::Mapping, path: &str) -> Result<Option<String>, DeclarativeError> {
    match get(n, "description") {
        None => Ok(None),
        Some(v) => match v.as_str() {
            Some(s) => Ok(Some(s.to_string())),
            None => Err(err(format!("{path}.description must be a string"))),
        },
    }
}

fn compile_enum(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let values = get(n, "enum").expect("base checked");
    let strings: Option<Vec<String>> = values
        .as_sequence()
        .map(|seq| seq.iter().map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or(None);
    match strings {
        Some(s) if !s.is_empty() => Ok(Schema::Enum(s)),
        _ => Err(err(format!(
            "{path}: enum must be a non-empty list of strings"
        ))),
    }
}

/// `const` — string | number | boolean, value-type validated (v2 drops v1's null).
fn compile_const(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let value = match get(n, "const").expect("base checked") {
        Value::String(s) => ConstValue::String(s.clone()),
        Value::Number(x) => ConstValue::Number(x.as_f64().unwrap_or(f64::NAN)),
        Value::Bool(b) => ConstValue::Bool(*b),
        other => {
            return Err(err(format!(
                "{path}: const must be a string, number, or boolean (got {})",
                describe(other)
            )));
        }
    };
    Ok(Schema::Const(value))
}

const TYPE_NAMES: &[&str] = &["string", "number", "integer", "boolean", "array", "object"];

/// Resolve the `type` keyword: a plain type name, or the two-element null union
/// `[T, "null"]` → `(T, nullable)`. Any other union is outside the v2 subset.
fn resolve_type<'a>(
    n: &'a serde_yaml::Mapping,
    path: &str,
) -> Result<(&'a str, bool), DeclarativeError> {
    let ty = get(n, "type").expect("base checked");
    match ty {
        Value::String(t) if TYPE_NAMES.contains(&t.as_str()) => Ok((t, false)),
        Value::String(t) => Err(err(format!(
            "{path}: unsupported type '{t}' (string | number | integer | boolean | array | object)"
        ))),
        Value::Sequence(seq) => {
            let parts: Option<Vec<&str>> = seq.iter().map(Value::as_str).collect();
            if let Some(parts) = &parts
                && parts.len() == 2
                && parts[1] == "null"
                && TYPE_NAMES.contains(&parts[0])
            {
                return Ok((seq[0].as_str().expect("checked"), true));
            }
            Err(err(format!(
                "{path}: type {} is outside the supported v2 subset (only the two-element union [T, \"null\"])",
                serde_json::to_string(&crate::frontmatter::yaml_to_json(ty.clone()))
                    .unwrap_or_else(|_| "?".into())
            )))
        }
        other => Err(err(format!(
            "{path}: type must be a type name or the two-element union [T, \"null\"] (got {})",
            describe(other)
        ))),
    }
}

fn compile_typed(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let (ty, nullable) = resolve_type(n, path)?;
    let base = match ty {
        "string" => {
            check_keys(
                n,
                &[
                    "type",
                    "minLength",
                    "maxLength",
                    "pattern",
                    "format",
                    "description",
                    "default",
                ],
                path,
            )?;
            string_schema(n, path)?
        }
        "number" | "integer" => {
            check_keys(
                n,
                &["type", "minimum", "maximum", "description", "default"],
                path,
            )?;
            Schema::Number {
                int: ty == "integer",
                min: num(n, "minimum"),
                max: num(n, "maximum"),
            }
        }
        "boolean" => {
            check_keys(n, &["type", "description", "default"], path)?;
            Schema::Boolean
        }
        "array" => {
            check_keys(
                n,
                &[
                    "type",
                    "items",
                    "minItems",
                    "maxItems",
                    "description",
                    "default",
                ],
                path,
            )?;
            let Some(items) = get(n, "items") else {
                return Err(err(format!(
                    "{path}: an array schema needs an 'items' schema"
                )));
            };
            Schema::Array {
                of: Box::new(compile_schema_v2(items, &format!("{path}[]"))?),
                min: num(n, "minItems"),
                max: num(n, "maxItems"),
            }
        }
        "object" => {
            check_keys(
                n,
                &[
                    "type",
                    "properties",
                    "required",
                    "additionalProperties",
                    "description",
                    "default",
                ],
                path,
            )?;
            object_schema(n, path)?
        }
        _ => unreachable!("resolve_type admits only supported names"),
    };
    Ok(if nullable {
        Schema::Nullable(Box::new(base))
    } else {
        base
    })
}

/// `type: string` — the named `format` now COMPOSES with `minLength` / `maxLength` /
/// `pattern`: each violated constraint reports
/// its own issue.
fn string_schema(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let pattern = match get(n, "pattern").and_then(Value::as_str) {
        Some(src) => Some(
            Regex::new(src).map_err(|e| err(format!("{path}: invalid pattern /{src}/: {e}")))?,
        ),
        None => None,
    };
    let min = num(n, "minLength");
    let max = num(n, "maxLength");
    if let Some(format) = get(n, "format").and_then(Value::as_str) {
        let Some(f) = StringFormat::from_name(format) else {
            return Err(err(format!(
                "{path}: unsupported string format '{format}' (expected one of: {})",
                STRING_FORMATS
                    .iter()
                    .map(|(n, _)| *n)
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        };
        return Ok(Schema::Format {
            format: f,
            min,
            max,
            pattern,
        });
    }
    Ok(Schema::String { min, max, pattern })
}

/// `type: object` — `properties` / `required` / `additionalProperties`. Properties are
/// optional unless listed in `required` (the JSON Schema inversion); each `required`
/// entry must name a declared property; `additionalProperties: false` is strict.
fn object_schema(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let properties = match get(n, "properties") {
        None => None,
        Some(Value::Mapping(map)) => Some(map),
        Some(other) => {
            return Err(err(format!(
                "{path}: properties must be a mapping of key → schema (got {})",
                describe(other)
            )));
        }
    };

    let required: Vec<String> = match get(n, "required") {
        None => Vec::new(),
        Some(v) => {
            let names: Option<Vec<String>> = v
                .as_sequence()
                .map(|seq| seq.iter().map(|e| e.as_str().map(str::to_string)).collect())
                .unwrap_or(None);
            names
                .ok_or_else(|| err(format!("{path}: required must be a list of property names")))?
        }
    };
    for name in &required {
        let declared = properties.is_some_and(|map| get(map, name).is_some());
        if !declared {
            return Err(err(format!(
                "{path}: required lists '{name}', which is not a declared property"
            )));
        }
    }

    let strict = match get(n, "additionalProperties") {
        None => false,
        Some(v) => !v
            .as_bool()
            .ok_or_else(|| err(format!("{path}: additionalProperties must be a boolean")))?,
    };

    let mut fields = Vec::new();
    if let Some(map) = properties {
        fields.reserve(map.len());
        for (key, value) in map {
            let Some(key) = key.as_str() else {
                return Err(err(format!("{path}: property keys must be strings")));
            };
            let mut field = compile_schema_v2(value, &format!("{path}.{key}"))?;
            if !required.iter().any(|r| r == key) {
                field = Schema::Optional(Box::new(field));
            }
            fields.push((key.to_string(), field));
        }
    }
    Ok(Schema::Object { fields, strict })
}

/// Compile the v2 `frontmatter:` block — itself a schema node, required to be an
/// explicit `type: object` (what makes the block literal JSON Schema).
pub fn compile_frontmatter_v2(fm: &Value) -> Result<Schema, DeclarativeError> {
    let Value::Mapping(node) = fm else {
        return Err(err(format!(
            "frontmatter: a v2 frontmatter must be a schema node with 'type: object' (got {})",
            describe(fm)
        )));
    };
    if get(node, "type").and_then(Value::as_str) != Some("object") {
        // Surface the sharper per-key rejection (a v1 `fields:` / `strict:` gets its
        // migration hint) before the blunt root-shape error.
        check_keys(
            node,
            &[
                "type",
                "properties",
                "required",
                "additionalProperties",
                "description",
                "default",
            ],
            "frontmatter",
        )?;
        return Err(err(
            "frontmatter: a v2 frontmatter must be a schema node with explicit 'type: object'"
                .into(),
        ));
    }
    compile_schema_v2(fm, "frontmatter")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{IssueKind, PathSeg, description_along_path};
    use serde_json::json;

    fn compile(yaml: &str) -> Result<Schema, DeclarativeError> {
        let v: Value = serde_yaml::from_str(yaml).unwrap();
        compile_schema_v2(&v, "schema")
    }

    fn msg(r: Result<Schema, DeclarativeError>) -> String {
        r.expect_err("expected a DeclarativeError").to_string()
    }

    // Contract first: the JSON Schema inversion — properties are OPTIONAL unless listed
    // in `required` (v1 made every field implicitly required).
    #[test]
    fn properties_are_optional_unless_required() {
        let s = compile(
            "type: object\nproperties:\n  id: { type: string }\n  note: { type: string }\nrequired: [id]",
        )
        .unwrap();
        // `note` absent → fine; `id` absent → invalid (required).
        assert!(s.safe_parse(Some(&json!({"id": "x"}))).is_ok());
        let issues = s.safe_parse(Some(&json!({}))).unwrap_err();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].path, vec![PathSeg::Key("id".into())]);
        assert_eq!(
            issues[0].kind,
            IssueKind::InvalidType { expected: "string" }
        );
    }

    #[test]
    fn additional_properties_false_is_strict() {
        let s = compile(
            "type: object\nproperties:\n  id: { type: string }\nrequired: [id]\nadditionalProperties: false",
        )
        .unwrap();
        let issues = s
            .safe_parse(Some(&json!({"id": "x", "zz": 1})))
            .unwrap_err();
        assert_eq!(
            issues[0].kind,
            IssueKind::UnrecognizedKeys {
                keys: vec!["zz".into()]
            }
        );
        // Without the flag, unknown keys pass (JSON Schema's default).
        let open = compile("type: object\nproperties:\n  id: { type: string }").unwrap();
        assert!(open.safe_parse(Some(&json!({"zz": 1}))).is_ok());
    }

    // `format` COMPOSES with bounds and pattern: each violated
    // constraint reports its own issue, format first.
    #[test]
    fn format_composes_with_bounds_and_pattern() {
        let s = compile("type: string\nformat: email\nminLength: 30\npattern: '^ops-'").unwrap();
        assert!(
            s.safe_parse(Some(&json!("ops-team+alerts@example-corp.com")))
                .is_ok()
        );
        let issues = s.safe_parse(Some(&json!("short"))).unwrap_err();
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
    }

    #[test]
    fn null_union_compiles_t_wrapped_nullable() {
        let s = compile("type: [string, 'null']\nminLength: 2").unwrap();
        assert!(s.safe_parse(Some(&json!(null))).is_ok());
        assert!(s.safe_parse(Some(&json!("ok"))).is_ok());
        assert_eq!(
            s.safe_parse(Some(&json!("x"))).unwrap_err()[0].kind,
            IssueKind::TooSmall
        );
    }

    #[test]
    fn integer_is_the_int_flag() {
        let s = compile("type: integer\nminimum: 0\nmaximum: 10").unwrap();
        assert!(s.safe_parse(Some(&json!(5))).is_ok());
        assert_eq!(
            s.safe_parse(Some(&json!(1.5))).unwrap_err()[0].kind,
            IssueKind::InvalidType { expected: "int" }
        );
        assert_eq!(
            s.safe_parse(Some(&json!(11))).unwrap_err()[0].kind,
            IssueKind::TooBig
        );
    }

    #[test]
    fn array_takes_items_and_bounds() {
        let s = compile("type: array\nitems: { type: string }\nminItems: 1\nmaxItems: 2").unwrap();
        assert!(s.safe_parse(Some(&json!(["a"]))).is_ok());
        assert_eq!(
            s.safe_parse(Some(&json!([]))).unwrap_err()[0].kind,
            IssueKind::TooSmall
        );
        assert_eq!(
            s.safe_parse(Some(&json!(["a", 2]))).unwrap_err()[0].path,
            vec![PathSeg::Index(1)]
        );
        assert_eq!(
            msg(compile("type: array")),
            "schema: an array schema needs an 'items' schema"
        );
    }

    #[test]
    fn enum_const_and_default_carry_over() {
        let e = compile("enum: [a, b]").unwrap();
        assert!(e.safe_parse(Some(&json!("b"))).is_ok());
        assert!(e.safe_parse(Some(&json!("c"))).is_err());
        assert!(compile("enum: []").is_err());
        assert!(compile("enum: [1, 2]").is_err());

        let c = compile("const: 3").unwrap();
        assert!(c.safe_parse(Some(&json!(3))).is_ok());
        // v2 consts are string | number | boolean — null is out.
        assert!(compile("const: null").is_err());

        let d = compile("type: string\ndefault: none").unwrap();
        assert!(d.safe_parse(None).is_ok()); // absent → the default substitutes
    }

    // The three rejection classes of the per-node allowed-key check.
    #[test]
    fn v1_spellings_get_migration_hints() {
        assert_eq!(
            msg(compile("type: object\nfields:\n  id: { type: string }")),
            "schema: 'fields' is the v1 spelling — mcVersion 2 uses 'properties'"
        );
        assert_eq!(
            msg(compile("type: array\nof: { type: string }")),
            "schema: 'of' is the v1 spelling — mcVersion 2 uses 'items'"
        );
        assert_eq!(
            msg(compile("type: object\nstrict: true")),
            "schema: 'strict' is the v1 spelling — mcVersion 2 uses 'additionalProperties: false'"
        );
        assert_eq!(
            msg(compile("type: number\nint: true")),
            "schema: 'int' is the v1 spelling — mcVersion 2 uses 'type: integer'"
        );
        assert_eq!(
            msg(compile("type: string\nnullable: true")),
            "schema: 'nullable' is the v1 spelling — mcVersion 2 uses 'type: [T, \"null\"]'"
        );
        assert_eq!(
            msg(compile("type: string\noptional: true")),
            "schema: 'optional' is the v1 spelling — mcVersion 2 uses 'required' (a property is optional unless listed there)"
        );
        assert_eq!(
            msg(compile("type: string\nmin: 3")),
            "schema: 'min' is the v1 spelling — mcVersion 2 uses 'minLength' (string), 'minimum' (number), or 'minItems' (array)"
        );
    }

    #[test]
    fn recognized_json_schema_outside_the_subset_is_named() {
        for kw in ["$ref: x", "multipleOf: 2", "prefixItems: []", "title: T"] {
            let m = msg(compile(&format!("type: number\n{kw}")));
            let key = kw.split(':').next().unwrap();
            assert_eq!(
                m,
                format!("schema: '{key}' is JSON Schema outside the supported v2 subset")
            );
        }
    }

    #[test]
    fn unknown_keys_and_shape_violations_reject() {
        assert_eq!(
            msg(compile("type: string\nminLenght: 3")), // the motivating typo
            "schema: unknown key 'minLenght'"
        );
        // A subset keyword on the wrong node type is unknown FOR that node.
        assert_eq!(
            msg(compile("type: number\nminLength: 3")),
            "schema: unknown key 'minLength'"
        );
        // Exactly one base.
        assert!(compile("minLength: 3").is_err());
        assert!(compile("type: string\nenum: [a]").is_err());
        // Union shapes outside [T, "null"].
        assert!(msg(compile("type: [string, number]")).contains("outside the supported v2 subset"));
        assert!(msg(compile("type: ['null', string]")).contains("outside the supported v2 subset"));
        assert!(compile("type: wibble").is_err());
        assert!(compile("type: string\nformat: zipcode").is_err());
        let v: Value = serde_yaml::from_str("- a").unwrap();
        assert!(compile_schema_v2(&v, "schema").is_err());
    }

    // `description` is STORED (needed for Finding.hint) and validation-transparent.
    #[test]
    fn descriptions_are_stored_on_nodes() {
        let v: Value = serde_yaml::from_str(
            "type: object\nproperties:\n  id:\n    type: string\n    description: the D-number\nrequired: [id]\ndescription: decision frontmatter",
        )
        .unwrap();
        let s = compile_schema_v2(&v, "frontmatter").unwrap();
        let key = |k: &str| PathSeg::Key(k.to_string());
        assert_eq!(
            description_along_path(&s, &[key("id")]),
            Some("the D-number")
        );
        assert_eq!(
            description_along_path(&s, &[]),
            Some("decision frontmatter")
        );
        assert!(s.safe_parse(Some(&json!({"id": "D-0001"}))).is_ok());
    }

    // The frontmatter root is itself a schema node — explicit `type: object` required.
    #[test]
    fn frontmatter_root_requires_explicit_type_object() {
        let ok: Value = serde_yaml::from_str(
            "type: object\nproperties:\n  id: { type: string }\nrequired: [id]",
        )
        .unwrap();
        assert!(compile_frontmatter_v2(&ok).is_ok());

        let missing: Value = serde_yaml::from_str("properties:\n  id: { type: string }").unwrap();
        assert_eq!(
            compile_frontmatter_v2(&missing).unwrap_err().to_string(),
            "frontmatter: a v2 frontmatter must be a schema node with explicit 'type: object'"
        );

        // A v1-shaped frontmatter gets the migration hint, not the blunt shape error.
        let v1: Value =
            serde_yaml::from_str("strict: true\nfields:\n  id: { type: string }").unwrap();
        assert_eq!(
            compile_frontmatter_v2(&v1).unwrap_err().to_string(),
            "frontmatter: 'strict' is the v1 spelling — mcVersion 2 uses 'additionalProperties: false'"
        );
    }

    #[test]
    fn required_must_name_declared_properties() {
        assert_eq!(
            msg(compile(
                "type: object\nproperties:\n  id: { type: string }\nrequired: [id, missing]"
            )),
            "schema: required lists 'missing', which is not a declared property"
        );
        assert!(compile("type: object\nrequired: [id]").is_err()); // no properties at all
    }
}
