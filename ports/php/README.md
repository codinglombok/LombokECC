# LombokECC — PHP Port

Reed-Solomon RS(255, 239) error correction over GF(256).
PHP port of the [TypeScript reference implementation](https://github.com/codinglombok/LombokECC).

## Install

```bash
composer require codinglombok/lombokecc
```

## Usage

```php
use CodingLombok\LombokEcc\ReedSolomon;
use CodingLombok\LombokEcc\GF256;

$rs = new ReedSolomon(255, 239);

// Encode
$message = [1, 2, 3, 4, 5];
$codeword = $rs->encode($message);

// Decode (corrects up to 8 errors)
$decoded = $rs->decode($codeword);  // 239 bytes
```

## Requirements

- PHP >= 8.1

## Test

```bash
php tests/check-vectors.php ../vectors/lombok-ecc-vectors-v1.json
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE)
