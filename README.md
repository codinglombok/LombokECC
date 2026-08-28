# LombokECC — Reed-Solomon Error Correction Codes

A TypeScript implementation of Reed-Solomon error-correction codes over GF(256).

**Version**: v0.0.6 · **Status**: 3,200+ randomised trials verified. CI enabled.

---

### GitHub

[![Stars](https://img.shields.io/github/stars/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=gold)](https://github.com/codinglombok/LombokECC/stargazers)
[![Release](https://img.shields.io/github/v/release/codinglombok/LombokECC?style=flat-square&logo=github&labelColor=181717&color=brightgreen)](https://github.com/codinglombok/LombokECC/releases)
[![License](https://img.shields.io/github/license/codinglombok/LombokECC?style=flat-square&logo=opensourceinitiative&labelColor=181717&color=brightgreen)](https://github.com/codinglombok/LombokECC/blob/main/LICENSE)

### Quality

[![CI](https://img.shields.io/github/actions/workflow/status/codinglombok/LombokECC/ci.yml?style=flat-square&logo=github-actions&logoColor=white&labelColor=2088FF&color=brightgreen&label=CI&branch=main)](https://github.com/codinglombok/LombokECC/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-3200%2B%20trials-brightgreen?style=flat-square&logo=checkmarx&logoColor=white&labelColor=21B352)](https://github.com/codinglombok/LombokECC)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=235A97)](https://www.typescriptlang.org/)
[![Zero deps](https://img.shields.io/badge/Dependencies-0%20runtime-brightgreen?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik05IDE2LjJMNC44IDEybC0xLjQgMS40TDkgMTkgMjEgN2wtMS40LTEuNHoiLz48L3N2Zz4=&labelColor=333)](#)

### Lombok Ecosystem

[![LombokClarion](https://img.shields.io/badge/LombokClarion-PHP%20Full%20Stack-777BB4?style=flat-square&logo=php&logoColor=white&labelColor=4F5B93)](https://github.com/codinglombok/LombokClarion)
[![LombokCSS](https://img.shields.io/badge/LombokCSS-Token--First%20CSS-264de4?style=flat-square&logo=css3&logoColor=white&labelColor=1b3ba0)](https://github.com/codinglombok/LombokCSS)
[![LombokCharts](https://img.shields.io/badge/LombokCharts-Zero--Dep%20Charts-FF6384?style=flat-square&logo=chartdotjs&logoColor=white&labelColor=C94070)](https://github.com/codinglombok/LombokCharts)
[![LombokQRCode](https://img.shields.io/badge/LombokQRCode-QR%20Generator-00C9A7?style=flat-square&logo=qrcode&logoColor=white&labelColor=00927A)](https://github.com/codinglombok/LombokQRCode)
[![LombokTableSheet](https://img.shields.io/badge/LombokTableSheet-Spreadsheet-F7931E?style=flat-square&logo=microsoftexcel&logoColor=white&labelColor=C4740A)](https://github.com/codinglombok/LombokTableSheet)
[![LombokAnimate](https://img.shields.io/badge/LombokAnimate-Animation-9B59B6?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik00IDE5aDJ2LTNINE0yMCAydjJsLTQtNC00IDR2LTJoNnYtM2g0djNINHYzeiIvPjwvc3ZnPg==&labelColor=7D3C98)](https://github.com/codinglombok/LombokAnimate)
[![LombokECC](https://img.shields.io/badge/LombokECC-Reed--Solomon-6C63FF?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==&labelColor=4B44CC)](https://github.com/codinglombok/LombokECC)

---

## Changes from v0.0.5

- Randomised within-capacity stress test (1,800 trials, 0–8 errors)
- Randomised overcapacity stress test (1,400 trials, 9–64 errors)
- Throughput benchmark (`bench.ts`)
- GitHub Actions CI (Node 20.x + 22.x)
- **fix(solver)**: handle rank-deficient/inconsistent systems in Gaussian elimination
- 0% miscorrection rate across all overcapacity trials

## Publishing

```bash
npm install && npm run build && npm run test:full
git tag -a v0.0.6 -m "LombokECC 0.0.6" && git push origin main --tags
npm publish --access public
```

## License

Apache-2.0 — [LICENSE](./LICENSE)

**Repository**: [github.com/codinglombok/LombokECC](https://github.com/codinglombok/LombokECC)
