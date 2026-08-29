# LombokECC — Rust Port

Reed-Solomon RS(255, 239) error correction over GF(256).
Rust port of the [TypeScript reference implementation](https://github.com/codinglombok/LombokECC).

## Install

```bash
cargo add lombokecc
```

## Usage

```rust
use lombokecc::ReedSolomon;

fn main() {
    let rs = ReedSolomon::new(255, 239);

    // Encode
    let codeword = rs.encode(&[1, 2, 3, 4, 5]);

    // Decode (corrects up to 8 errors)
    let decoded = rs.decode(&codeword).unwrap();  // 239 bytes
}
```

## Requirements

- Rust edition 2021+
- No dependencies

## Test

```bash
cargo run --bin check-vectors -- ../vectors/lombok-ecc-vectors-v1.txt
```

## Publish to crates.io

```bash
cargo test && cargo publish
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE)
