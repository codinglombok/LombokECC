# LombokECC — Go Port

Reed-Solomon RS(255, 239) error correction over GF(256).
Go port of the [TypeScript reference implementation](https://github.com/codinglombok/LombokECC).

## Install

```bash
go get github.com/codinglombok/LombokECC-go@v0.1.0
```

## Usage

```go
package main

import "github.com/codinglombok/LombokECC-go"

func main() {
    rs := lombokecc.New(255, 239)

    // Encode
    codeword := rs.Encode([]byte{1, 2, 3, 4, 5})

    // Decode (corrects up to 8 errors)
    decoded, err := rs.Decode(codeword)
    if err != nil {
        panic("too many errors")
    }
    _ = decoded // 239 bytes
}
```

## Requirements

- Go >= 1.22

## Test

```bash
go run cmd/check-vectors/main.go
```

## Publish

```bash
git tag v0.1.0 && git push origin v0.1.0
GOPROXY=proxy.golang.org go list -m github.com/codinglombok/LombokECC-go@v0.1.0
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE)
