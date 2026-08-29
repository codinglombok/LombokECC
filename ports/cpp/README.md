# LombokECC — C++ Port

Reed-Solomon RS(255, 239) error correction over GF(256).
Header-only C++ port of the [TypeScript reference implementation](https://github.com/codinglombok/LombokECC).

## Install

Header-only — copy `include/lombok_ecc.hpp` into your project.

## Usage

```cpp
#include "lombok_ecc.hpp"

int main() {
    auto rs = lombokecc::ReedSolomon(255, 239);

    // Encode
    auto codeword = rs.encode({1, 2, 3, 4, 5});

    // Decode (corrects up to 8 errors)
    auto decoded = rs.decode(codeword);  // 239 bytes
}
```

## Requirements

- C++17 or later
- No dependencies

## Build & Test

```bash
mkdir build && cd build
cmake ..
make
ctest
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE)
