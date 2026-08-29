# LombokECC — Python Port

Reed-Solomon RS(255, 239) error correction over GF(256).
Python port of the [TypeScript reference implementation](https://github.com/codinglombok/LombokECC).

## Install

```bash
pip install lombokecc
```

## Usage

```python
from lombok_ecc import ReedSolomon

rs = ReedSolomon(255, 239)

# Encode
message = bytes([1, 2, 3, 4, 5])
codeword = rs.encode(message)

# Decode (corrects up to 8 errors)
decoded = rs.decode(codeword)  # 239 bytes
```

## Requirements

- Python >= 3.9

## Test

```bash
python tests/check_vectors.py
```

## Publish to PyPI

```bash
python3 -m build
python3 -m twine upload dist/*
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE)
