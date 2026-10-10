# Finding priority

This dependency-free Rust crate models MemReview's supported finding severities
and stably orders findings from most to least severe:

`critical` → `high` → `medium` → `low` → `nit`

```rust
use finding_priority::{prioritize, Finding, Severity};

let mut findings = vec![
    Finding {
        id: "f1".into(),
        severity: Severity::Nit,
        message: "A minor style issue".into(),
    },
    Finding {
        id: "f2".into(),
        severity: Severity::Critical,
        message: "An unsafe operation".into(),
    },
];

prioritize(&mut findings);
assert_eq!(findings[0].id, "f2");
```

Parse severity labels at input boundaries with `str::parse::<Severity>()`;
unknown labels return an error. Run the crate's tests with `cargo test` from this
directory. The crate is standalone and does not change the current Python API.
