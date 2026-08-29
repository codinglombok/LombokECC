# LombokECC

Reed-Solomon error-correction codes over GF(256) — **RS(255, 239), t = 8**.
Zero-dependency TypeScript library with ports in PHP, Python, Go, Rust, and C++.
Licensed **Apache-2.0**.

---

## GitHub

[![Stars](https://img.shields.io/github/stars/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=gold)](https://github.com/codinglombok/LombokECC/stargazers)
[![Forks](https://img.shields.io/github/forks/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=blue)](https://github.com/codinglombok/LombokECC/network/members)
[![Issues](https://img.shields.io/github/issues/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=orange)](https://github.com/codinglombok/LombokECC/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=8A2BE2)](https://github.com/codinglombok/LombokECC/pulls)
[![Release](https://img.shields.io/github/v/release/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=brightgreen)](https://github.com/codinglombok/LombokECC/releases)
[![License](https://img.shields.io/github/license/codinglombok/LombokECC?style=flat-square&logo=opensourceinitiative&labelColor=181717&color=brightgreen)](https://github.com/codinglombok/LombokECC/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=teal)](https://github.com/codinglombok/LombokECC/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=gray)](https://github.com/codinglombok/LombokECC)
[![Downloads](https://img.shields.io/github/downloads/codinglombok/LombokECC/total?style=flat-square&logo=github&labelColor=181717&color=brightgreen&label=Downloads)](https://github.com/codinglombok/LombokECC/releases)
[![Latest Downloads](https://img.shields.io/github/downloads/codinglombok/LombokECC/latest/total?style=flat-square&logo=github&labelColor=181717&color=blue&label=Latest)](https://github.com/codinglombok/LombokECC/releases/latest)
[![Clones](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub-clone-count.onrender.com%2Fclone-count%3Frepo%3Dcodinglombok%2FLombokECC&query=%24.count&style=flat-square&logo=github&labelColor=181717&color=teal&label=Clones)](https://github.com/codinglombok/LombokECC)

## npm

[![npm version](https://img.shields.io/npm/v/lombokecc?style=flat-square&logo=npm&logoColor=white&labelColor=CB3837&color=CB3837)](https://www.npmjs.com/package/lombokecc)
[![npm downloads](https://img.shields.io/npm/dm/lombokecc?style=flat-square&logo=npm&logoColor=white&labelColor=CB3837&color=orange)](https://www.npmjs.com/package/lombokecc)
[![npm total downloads](https://img.shields.io/npm/dt/lombokecc?style=flat-square&logo=npm&logoColor=white&labelColor=CB3837&color=blue)](https://www.npmjs.com/package/lombokecc)

## GitHub Packages

[![npm GPR](https://img.shields.io/badge/npm-GPR-CB3837?style=flat-square&logo=npm&logoColor=white&labelColor=8B0000)](https://github.com/codinglombok/LombokECC/pkgs/npm/lombokecc)

## Packagist

[![Packagist version](https://img.shields.io/packagist/v/codinglombok/lombokecc?style=flat-square&logo=packagist&logoColor=white&labelColor=F28D1A&color=F28D1A)](https://packagist.org/packages/codinglombok/lombokecc)
[![Packagist downloads](https://img.shields.io/packagist/dt/codinglombok/lombokecc?style=flat-square&logo=packagist&logoColor=white&labelColor=F28D1A&color=orange)](https://packagist.org/packages/codinglombok/lombokecc)

## PyPI

[![PyPI version](https://img.shields.io/pypi/v/lombokecc?style=flat-square&logo=pypi&logoColor=white&labelColor=3775A9&color=3775A9)](https://pypi.org/project/lombokecc/)
[![PyPI downloads](https://img.shields.io/pypi/dm/lombokecc?style=flat-square&logo=pypi&logoColor=white&labelColor=3775A9&color=blue)](https://pypi.org/project/lombokecc/)

## Quality

[![CI](https://img.shields.io/github/actions/workflow/status/codinglombok/LombokECC/ci.yml?style=flat-square&logo=github-actions&logoColor=white&labelColor=2088FF&color=brightgreen&label=CI&branch=main)](https://github.com/codinglombok/LombokECC/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-3200%2B%20trials-brightgreen?style=flat-square&logo=checkmarx&logoColor=white&labelColor=21B352)](https://github.com/codinglombok/LombokECC)
[![Mutations](https://img.shields.io/badge/Mutations-12%2F12%20expected-brightgreen?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik05IDE2LjJMNC44IDEybC0xLjQgMS40TDkgMTkgMjEgN2wtMS40LTEuNHoiLz48L3N2Zz4=&labelColor=333)](#)
[![Zero deps](https://img.shields.io/badge/Dependencies-0%20runtime-brightgreen?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik05IDE2LjJMNC44IDEybC0xLjQgMS40TDkgMTkgMjEgN2wtMS40LTEuNHoiLz48L3N2Zz4=&labelColor=333)](https://github.com/codinglombok/LombokECC/blob/main/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=235A97)](https://www.typescriptlang.org/)
[![Ports](https://img.shields.io/badge/Ports-6%20languages-6C63FF?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==&labelColor=4B44CC)](#ports)
[![Conventional Commits](https://img.shields.io/badge/Commits-Conventional-FE5196?style=flat-square&logo=conventionalcommits&logoColor=white)](https://conventionalcommits.org)

## SourceForge

[![SF Downloads](https://img.shields.io/sourceforge/dt/lombokecc?style=flat-square&logo=sourceforge&logoColor=white&labelColor=FF6600&color=FF6600)](https://sourceforge.net/projects/lombokecc/files/latest/download)
[![SF Monthly](https://img.shields.io/sourceforge/dm/lombokecc?style=flat-square&logo=sourceforge&logoColor=white&labelColor=FF6600&color=orange)](https://sourceforge.net/projects/lombokecc/files/latest/download)
[![SF Weekly](https://img.shields.io/sourceforge/dw/lombokecc?style=flat-square&logo=sourceforge&logoColor=white&labelColor=FF6600&color=yellow)](https://sourceforge.net/projects/lombokecc/files/latest/download)
[![SourceForge](https://img.shields.io/badge/SourceForge-Mirror-FF6600?style=flat-square&logo=sourceforge&logoColor=white&labelColor=CC4400)](https://sourceforge.net/projects/lombokecc)

## Community

[![Contributors](https://img.shields.io/github/contributors/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=blue)](https://github.com/codinglombok/LombokECC/graphs/contributors)
[![Sponsors](https://img.shields.io/github/sponsors/codinglombok?style=flat-square&logo=github-sponsors&logoColor=white&labelColor=EA4AAA&color=EA4AAA)](https://github.com/sponsors/codinglombok)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square&logo=git&logoColor=white&labelColor=1B5E20)](https://github.com/codinglombok/LombokECC/blob/main/CONTRIBUTING.md)

## Lombok Ecosystem

[![LombokClarion](https://img.shields.io/badge/LombokClarion-PHP%20Full%20Stack-777BB4?style=flat-square&logo=php&logoColor=white&labelColor=4F5B93)](https://github.com/codinglombok/LombokClarion)
[![LombokCSS](https://img.shields.io/badge/LombokCSS-Token--First%20CSS-264de4?style=flat-square&logo=css3&logoColor=white&labelColor=1b3ba0)](https://github.com/codinglombok/LombokCSS)
[![LombokCharts](https://img.shields.io/badge/LombokCharts-Zero--Dep%20Charts-FF6384?style=flat-square&logo=chartdotjs&logoColor=white&labelColor=C94070)](https://github.com/codinglombok/LombokCharts)
[![LombokQRCode](https://img.shields.io/badge/LombokQRCode-QR%20Generator-00C9A7?style=flat-square&logo=qrcode&logoColor=white&labelColor=00927A)](https://github.com/codinglombok/LombokQRCode)
[![LombokTableSheet](https://img.shields.io/badge/LombokTableSheet-Spreadsheet-F7931E?style=flat-square&logo=microsoftexcel&logoColor=white&labelColor=C4740A)](https://github.com/codinglombok/LombokTableSheet)
[![LombokAnimate](https://img.shields.io/badge/LombokAnimate-Animation-9B59B6?style=flat-square&logo=css3&logoColor=white&labelColor=7D3C98)](https://github.com/codinglombok/LombokAnimate)
[![LombokECC](https://img.shields.io/badge/LombokECC-Reed--Solomon-6C63FF?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==&labelColor=4B44CC)](https://github.com/codinglombok/LombokECC)
[![LombokPDF](https://img.shields.io/badge/LombokPDF-PDF%20Toolkit-E34F26?style=flat-square&logo=adobeacrobatreader&logoColor=white&labelColor=B71C1C)](https://github.com/codinglombok/LombokPDF)
[![LombokUnram](https://img.shields.io/badge/LombokUnram-Computer%20Vision-4CAF50?style=flat-square&logo=opencv&logoColor=white&labelColor=2E7D32)](https://github.com/codinglombok/LombokUnram)

---

## Parameters

| Parameter | Value |
|---|---|
| Codeword length (n) | 255 |
| Message length (k) | 239 |
| Parity bytes | 16 |
| Correctable errors (t) | 8 bytes per block |
| Field | GF(256), primitive polynomial 0x11D |

## Installation

```bash
npm install lombokecc
```

**ESM only.** This package is `"type": "module"` and has no CommonJS build.

### Other registries

| Registry | Install |
|---|---|
| **npm** | `npm install lombokecc` |
| **GitHub Packages** | `npm install @codinglombok/lombokecc` |
| **Packagist** | `composer require codinglombok/lombokecc` |
| **PyPI** | `pip install lombokecc` |
| **Go** | `go get github.com/codinglombok/LombokECC-go@v0.1.0` |
| **crates.io** | `cargo add lombokecc` |
| **C++** | Header-only — copy `include/lombok_ecc.hpp` |

## Usage

### Encoding

```typescript
import { ReedSolomon } from 'lombokecc';

const rs = new ReedSolomon(255, 239);

const message = new Uint8Array([1, 2, 3, 4, 5]);
const codeword = rs.encode(message);   // 255 bytes

rs.isValid(codeword);                  // true
```

### Decoding

```typescript
const corrupted = new Uint8Array(codeword);
corrupted[10] ^= 0xFF;
corrupted[20] ^= 0xAA;

try {
  const decoded = rs.decode(corrupted);      // always 239 bytes
  const recovered = decoded.slice(-message.length);
} catch (err) {
  // more than t errors, or correction failed verification
}
```

### GF(256) arithmetic

```typescript
import { GF256 } from 'lombokecc/gf256';

const gf = new GF256();
gf.mul(5, 7);    // GF multiplication
gf.div(5, 7);
gf.inv(5);
gf.pow(5, 10);
```

## Algorithms

The decode pipeline: syndromes → Peterson-Gorenstein-Zierler → Chien search → direct error-value solver. All via Gaussian elimination over GF(256). `decode()` throws when it cannot correct — it never returns unverified data.

## Ports

All ports validate against the same test vector set (42 test cases).

| Language | Registry | Status |
|---|---|---|
| TypeScript | [npm](https://www.npmjs.com/package/lombokecc) | ✅ 42/42 |
| PHP | [Packagist](https://packagist.org/packages/codinglombok/lombokecc) | ✅ 42/42 |
| Python | [PyPI](https://pypi.org/project/lombokecc/) | ✅ 42/42 |
| Go | [proxy.golang.org](https://pkg.go.dev/github.com/codinglombok/LombokECC-go) | ✅ 42/42 |
| Rust | [crates.io](https://crates.io/crates/lombokecc) | ✅ 42/42 |
| C++ | Header-only | ✅ 42/42 |

## Testing

```bash
npm ci
npm run build

npm test              # quick (test-rs only)
npm run test:full     # all 5 suites
npm run test:stress   # randomised capacity / overcapacity only
./mutate.sh           # mutation testing (12 mutations)
node dist/bench.js    # benchmark
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).

---

**Author**: [codinglombok](https://github.com/codinglombok)
**Repository**: [github.com/codinglombok/LombokECC](https://github.com/codinglombok/LombokECC)
