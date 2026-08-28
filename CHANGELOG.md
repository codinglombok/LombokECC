# Changelog

## [0.0.6] — 2026-07-26

### Added
- `test-capacity.ts` — randomised within-capacity stress test (1,800 trials, 0–8 errors)
- `test-overcapacity.ts` — randomised overcapacity stress test (1,400 trials, 9–64 errors)
- `bench.ts` — throughput benchmark
- `.github/workflows/ci.yml` — GitHub Actions CI (Node 20.x + 22.x)

### Fixed
- `gaussianElimination()` now handles rank-deficient and inconsistent systems

## [0.0.5] — 2026-07-26

### Fixed
- Corrected systemic RS message comparison — decoder was comparing against wrong portion of codeword
- Added codeword validation after correction — `decode()` now throws on failed correction (fail-closed)

## [0.0.4] — 2026-07-26

### Changed
- **BREAKING**: Berlekamp-Massey replaced by Peterson-Gorenstein-Zierler (Gaussian elimination over GF(256))
- **BREAKING**: Forney formula replaced by direct error-value solver
- Major rewrite of `reed-solomon.ts` (296 diff lines vs v0.0.3)

## [0.0.3] — 2026-07-25

### Changed
- Decoder internals refactored (111 diff lines vs v0.0.2)
- BMA L-update condition definitively confirmed as root cause — decision made to replace entire algorithm

## [0.0.2] — 2026-07-25

### Changed
- Multiple Forney formula variants tested in decoder
- Decoder debugging via modified test vectors

### Fixed
- BMA L-computation bug identified: computes L=8 for single-error case (should be L=1)

## [0.0.1] — 2026-07-25

### Added
- GF(256) field arithmetic (`gf256.ts`): exp/log tables, primitive polynomial 0x11D, mul/div/inv/pow
- Systematic RS(255, 239) encoder: parity layout `[parity(16) || message(239)]`
- Decoder skeleton (Berlekamp-Massey + Forney) — known incorrect for most error patterns
- `test-rs.ts` — integration tests
- `test-encode-only.ts` — encoding validation tests
- `test-gf-poly.ts` — GF(256) field + polynomial verification
- `package.json`, `tsconfig.json`, `LICENSE` (Apache-2.0)
