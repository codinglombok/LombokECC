#!/bin/bash
# Menjalankan harness vector untuk SEMUA port. Exit 1 kalau ada satu pun gagal.
cd "$(dirname "${BASH_SOURCE[0]}")"
J=vectors/lombok-ecc-vectors-v1.json; F=vectors/lombok-ecc-vectors-v1.txt
FAIL=0
run() { printf "%-8s " "$1"; shift; if "$@" >/dev/null 2>&1; then echo "LULUS (exit 0)"; else echo "GAGAL (exit $?)"; FAIL=1; fi; }
run "PHP"    php php/tests/check-vectors.php "$J"
run "Python" python3 python/tests/check_vectors.py "$J"
run "Go"     bash -c "cd go && GOCACHE=/tmp/gocache GOPATH=/tmp/gopath go run ./cmd/check-vectors ../$J"
run "Rust"   bash -c "cd rust && rustc --edition 2021 --crate-type lib --crate-name lombokecc src/lib.rs -o target/liblombokecc.rlib && rustc --edition 2021 --extern lombokecc=target/liblombokecc.rlib src/bin/check_vectors.rs -o target/check_vectors && ./target/check_vectors ../$F"
run "C++"    bash -c "cd cpp && g++ -std=c++17 -O2 -Wall -Wextra -o build/check_vectors tests/check_vectors.cpp && ./build/check_vectors ../$F"
echo "────────────────────"
[ $FAIL -eq 0 ] && { echo "semua port lulus"; exit 0; }
echo "ada port gagal"; exit 1
