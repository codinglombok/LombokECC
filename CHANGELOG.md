# Changelog

## [0.0.1] — 2026-07-25

### Added
- GF(256) field arithmetic (`gf256.ts`): exp/log tables, primitive polynomial 0x11D, mul/div/inv/pow
- Systematic RS(255, 239) encoder: parity layout `[parity(16) || message(239)]`
- Decoder skeleton (Berlekamp-Massey + Forney) — known incorrect for most error patterns
- `test-rs.ts` — integration tests
- `test-encode-only.ts` — encoding validation tests
- `test-gf-poly.ts` — GF(256) field + polynomial verification
- `package.json`, `tsconfig.json`, `LICENSE` (Apache-2.0)
