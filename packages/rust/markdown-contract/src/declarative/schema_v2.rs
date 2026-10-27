//! The schema compiler for the `mcVersion: 2` JSON Schema subset: a YAML mapping in, a
//! [`Schema`] out, mirroring the TS `compileSchemaV2`.
//!
//! The subset: `properties` / `required` (a property is optional unless listed) /
//! `additionalProperties`, `minLength`–`maxLength`, `minimum`–`maximum`,
//! `minItems`–`maxItems`, `items`, `type: integer`, the null union `type: [T, "null"]`,
//! `enum`, `const`, `default`, and a `format` that composes with the length bounds and
//! `pattern`. `description` is stored on every node for `Finding.hint`.
//!
//! Every node is checked against its type's allowed keys. A v1 spelling gets a pointer to
//! its v2 form, JSON Schema outside the subset is named as such, and anything else is an
//! unknown key. Each known key must have the type TS requires.

use regex::Regex;
use serde_yaml::Value;

use super::errors::DeclarativeError;
use super::yaml::{self, describe, num, render, string, strings};
use crate::schema::{ConstValue, STRING_FORMATS, Schema, StringFormat};

fn err(msg: String) -> DeclarativeError {
    DeclarativeError::InvalidSchema(msg)
}

// ── The per-node allowed-key check (three rejection classes) ─────────────────────────

/// The v1 spellings and their v2 counterparts, for the error message.
const V1_SPELLINGS: &[(&str, &str)] = &[
    ("fields", "'properties'"),
    ("of", "'items'"),
    ("strict", "'additionalProperties: false'"),
    ("int", "'type: integer'"),
    ("nullable", "a [T, \"null\"] type union"),
    ("optional", "omission from 'required'"),
    ("min", "'minLength' / 'minimum' / 'minItems'"),
    ("max", "'maxLength' / 'maximum' / 'maxItems'"),
];

/// JSON Schema keywords outside the supported subset.
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

fn check_keys(
    n: &serde_yaml::Mapping,
    allowed: &[&str],
    path: &str,
) -> Result<(), DeclarativeError> {
    yaml::check_keys(n, allowed, path, V1_SPELLINGS, OUTSIDE_SUBSET, err)
}

// ── The node compiler ─────────────────────────────────────────────────────────────────

/// Compile one v2 schema node (the JSON Schema subset) into a [`Schema`].
pub(super) fn compile_schema_v2(node: &Value, path: &str) -> Result<Schema, DeclarativeError> {
    let Value::Mapping(n) = node else {
        return Err(err(format!(
            "{path}: a schema must be a mapping (got {})",
            describe(node)
        )));
    };

    // Exactly one of type / enum / const supplies the base.
    let bases: Vec<&str> = ["type", "enum", "const"]
        .into_iter()
        .filter(|k| n.get(k).is_some())
        .collect();
    if bases.len() != 1 {
        let got = if bases.len() > 1 {
            format!(" (got {})", bases.join(" + "))
        } else {
            String::new()
        };
        return Err(err(format!(
            "{path}: a schema needs exactly one of type / enum / const{got}"
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
    if n.get("default").is_some() {
        schema = Schema::Default(Box::new(schema));
    }
    if let Some(description) = yaml::description_of(n, path, err)? {
        schema = Schema::Described {
            inner: Box::new(schema),
            description,
        };
    }
    Ok(schema)
}

fn compile_enum(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    match strings(n, "enum") {
        Some(s) if !s.is_empty() => Ok(Schema::Enum(s)),
        _ => Err(err(format!(
            "{path}: enum must be a non-empty list of strings"
        ))),
    }
}

/// `const`: a string, number or boolean.
fn compile_const(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let value = match n.get("const").expect("base checked") {
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

/// Resolve the `type` keyword: a type name, or the two-element null union, `[T, "null"]`
/// or `["null", T]`, as `(T, nullable)`. Any other union is outside the subset.
fn resolve_type<'a>(
    n: &'a serde_yaml::Mapping,
    path: &str,
) -> Result<(&'a str, bool), DeclarativeError> {
    let ty = n.get("type").expect("base checked");
    match ty {
        Value::String(t) if TYPE_NAMES.contains(&t.as_str()) => Ok((t, false)),
        Value::String(t) => Err(err(format!(
            "{path}: unsupported type '{t}' (string | number | integer | boolean | array | object)"
        ))),
        Value::Sequence(seq) => {
            let others: Vec<&Value> = seq.iter().filter(|v| v.as_str() != Some("null")).collect();
            if let ([base], 2) = (others.as_slice(), seq.len())
                && let Some(base) = base.as_str()
                && TYPE_NAMES.contains(&base)
            {
                return Ok((base, true));
            }
            Err(err(format!(
                "{path}: type {} is outside the supported v2 subset (a type union may only pair one base type with \"null\")",
                render(Some(ty))
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
                min: num(n, "minimum", path, err)?,
                max: num(n, "maximum", path, err)?,
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
            let Some(items) = n.get("items") else {
                return Err(err(format!(
                    "{path}: an array schema needs an 'items' element schema"
                )));
            };
            Schema::Array {
                of: Box::new(compile_schema_v2(items, &format!("{path}.items"))?),
                min: num(n, "minItems", path, err)?,
                max: num(n, "maxItems", path, err)?,
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

/// `type: string`. A named `format` composes with `minLength` / `maxLength` / `pattern`:
/// each violated constraint reports its own issue.
fn string_schema(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let format = string(n, "format", path, err)?;
    let min = num(n, "minLength", path, err)?;
    let max = num(n, "maxLength", path, err)?;
    let pattern = match string(n, "pattern", path, err)? {
        Some(src) => Some(
            Regex::new(src).map_err(|e| err(format!("{path}: invalid pattern /{src}/: {e}")))?,
        ),
        None => None,
    };
    if let Some(format) = format {
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

/// `type: object`: `properties` (required), `required` and `additionalProperties`. A
/// property is optional unless listed in `required`, and each `required` entry must name
/// a declared property. `additionalProperties: false` rejects unknown keys.
fn object_schema(n: &serde_yaml::Mapping, path: &str) -> Result<Schema, DeclarativeError> {
    let properties = match n.get("properties") {
        None => {
            return Err(err(format!(
                "{path}: an object schema needs a 'properties' map of key → schema"
            )));
        }
        Some(Value::Mapping(map)) => map,
        Some(_) => {
            return Err(err(format!(
                "{path}.properties must be a mapping of key → schema"
            )));
        }
    };

    let required: Vec<String> = match n.get("required") {
        None => Vec::new(),
        Some(_) => strings(n, "required")
            .ok_or_else(|| err(format!("{path}.required must be a list of property names")))?,
    };
    for name in &required {
        if properties.get(name).is_none() {
            return Err(err(format!(
                "{path}.required names '{name}', which is not declared in properties"
            )));
        }
    }

    let strict = match n.get("additionalProperties") {
        None => false,
        Some(Value::Bool(b)) => !b,
        Some(_) => {
            return Err(err(format!(
                "{path}.additionalProperties must be a boolean in the v2 subset (a schema form is not supported)"
            )));
        }
    };

    let mut fields = Vec::with_capacity(properties.len());
    for (key, value) in properties {
        let Some(key) = key.as_str() else {
            return Err(err(format!("{path}: property keys must be strings")));
        };
        let mut field = compile_schema_v2(value, &format!("{path}.{key}"))?;
        if !required.iter().any(|r| r == key) {
            field = Schema::Optional(Box::new(field));
        }
        fields.push((key.to_string(), field));
    }
    Ok(Schema::Object { fields, strict })
}

/// Compile the `frontmatter:` block: a schema node that must be an explicit
/// `type: object`, as the TS `compileObjectSchemaV2` requires.
pub(super) fn compile_frontmatter_v2(fm: &Value) -> Result<Schema, DeclarativeError> {
    let is_object = matches!(fm, Value::Mapping(node) if node.get("type").and_then(Value::as_str) == Some("object"));
    if !is_object {
        return Err(err("frontmatter: a v2 frontmatter is an object schema — a mapping with an explicit 'type: object' (plus 'properties' / 'required' / 'additionalProperties'); the v1 'strict' / 'fields' form is not v2 (markdown-contract migrate rewrites v1 files)".into()));
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
            "schema: an array schema needs an 'items' element schema"
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
            "schema: 'fields' is the v1 spelling — v2 uses 'properties' (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: array\nof: { type: string }")),
            "schema: 'of' is the v1 spelling — v2 uses 'items' (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: object\nstrict: true")),
            "schema: 'strict' is the v1 spelling — v2 uses 'additionalProperties: false' (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: number\nint: true")),
            "schema: 'int' is the v1 spelling — v2 uses 'type: integer' (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: string\nnullable: true")),
            "schema: 'nullable' is the v1 spelling — v2 uses a [T, \"null\"] type union (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: string\noptional: true")),
            "schema: 'optional' is the v1 spelling — v2 uses omission from 'required' (markdown-contract migrate rewrites v1 files)"
        );
        assert_eq!(
            msg(compile("type: string\nmin: 3")),
            "schema: 'min' is the v1 spelling — v2 uses 'minLength' / 'minimum' / 'minItems' (markdown-contract migrate rewrites v1 files)"
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
        // `null` may come first or second, as in TS.
        let s = compile("type: ['null', string]").unwrap();
        assert!(s.safe_parse(Some(&json!(null))).is_ok());
        assert!(s.safe_parse(Some(&json!(1))).is_err());
        assert!(msg(compile("type: ['null', 'null']")).contains("outside the supported v2 subset"));
        assert!(compile("type: wibble").is_err());
        assert!(compile("type: string\nformat: zipcode").is_err());
        let v: Value = serde_yaml::from_str("- a").unwrap();
        assert!(compile_schema_v2(&v, "schema").is_err());
        assert_eq!(
            msg(compile("type: string\nenum: [a]")),
            "schema: a schema needs exactly one of type / enum / const (got type + enum)"
        );
    }

    // Each known key must have the type TS requires.
    #[test]
    fn known_keys_are_type_checked() {
        assert_eq!(
            msg(compile("type: string\nminLength: '3'")),
            "schema.minLength must be a number"
        );
        assert_eq!(
            msg(compile("type: integer\nmaximum: ten")),
            "schema.maximum must be a number"
        );
        assert_eq!(
            msg(compile(
                "type: array\nitems: { type: string }\nmaxItems: []"
            )),
            "schema.maxItems must be a number"
        );
        assert_eq!(
            msg(compile("type: string\nformat: [email]")),
            "schema.format must be a string"
        );
        assert_eq!(
            msg(compile("type: string\npattern: 3")),
            "schema.pattern must be a string"
        );
        assert_eq!(
            msg(compile("type: object")),
            "schema: an object schema needs a 'properties' map of key → schema"
        );
        assert_eq!(
            msg(compile(
                "type: object\nproperties: {}\nadditionalProperties: {}"
            )),
            "schema.additionalProperties must be a boolean in the v2 subset (a schema form is not supported)"
        );
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
            "frontmatter: a v2 frontmatter is an object schema — a mapping with an explicit 'type: object' (plus 'properties' / 'required' / 'additionalProperties'); the v1 'strict' / 'fields' form is not v2 (markdown-contract migrate rewrites v1 files)"
        );
    }

    #[test]
    fn required_must_name_declared_properties() {
        assert_eq!(
            msg(compile(
                "type: object\nproperties:\n  id: { type: string }\nrequired: [id, missing]"
            )),
            "schema.required names 'missing', which is not declared in properties"
        );
        assert!(compile("type: object\nrequired: [id]").is_err()); // no properties at all
    }
}
