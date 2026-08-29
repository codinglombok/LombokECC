#!/bin/bash
# Membuktikan tiap harness port BISA GAGAL. Harness yang selalu hijau tak berguna
# (pelajaran Sesi 13: dua suite hijau-by-construction).
# Tiap sabotase harus menghasilkan exit 1. Kalau ada yang tetap exit 0 → harness bocor.
cd "$(dirname "${BASH_SOURCE[0]}")"
DEV=0
JSON=vectors/lombok-ecc-vectors-v1.json
FLAT=vectors/lombok-ecc-vectors-v1.txt

check() { # nama, dir, file, sed-expr, perintah-uji
  local name="$1" f="$2" expr="$3"; shift 3
  cp "$f" /tmp/sab.bak
  sed -i "$expr" "$f"
  if ! grep -q . "$f"; then echo "  HARNESS-BUG $name: file kosong"; DEV=$((DEV+1)); cp /tmp/sab.bak "$f"; return; fi
  if diff -q /tmp/sab.bak "$f" >/dev/null; then
    echo "  HARNESS-BUG $name: sed tidak mengubah apa pun"; DEV=$((DEV+1)); cp /tmp/sab.bak "$f"; return
  fi
  "$@" >/dev/null 2>&1
  local rc=$?
  cp /tmp/sab.bak "$f"
  if [ $rc -ne 0 ]; then echo "  OK  $name → exit $rc (terdeteksi)"
  else echo "  BOCOR  $name → exit 0 (sabotase TIDAK terdeteksi)"; DEV=$((DEV+1)); fi
}

echo "── Sabotase: polinomial primitif 0x11d → 0x11b ──"
check "PHP  poly"    php/src/GF256.php          "s/0x11d;/0x11b;/"                     php php/tests/check-vectors.php $JSON
check "Py   poly"    python/lombok_ecc/__init__.py "s/PRIMITIVE_POLY = 0x11D/PRIMITIVE_POLY = 0x11B/" python3 python/tests/check_vectors.py $JSON
check "Go   poly"    go/lombokecc.go            "s/PrimitivePoly = 0x11d/PrimitivePoly = 0x11b/" bash -c "cd go && GOCACHE=/tmp/gocache GOPATH=/tmp/gopath go run ./cmd/check-vectors ../$JSON"
check "Rust poly"    rust/src/lib.rs            "s/PRIMITIVE_POLY: u32 = 0x11d/PRIMITIVE_POLY: u32 = 0x11b/" bash -c "cd rust && rustc --edition 2021 --crate-type lib --crate-name lombokecc src/lib.rs -o target/liblombokecc.rlib && rustc --edition 2021 --extern lombokecc=target/liblombokecc.rlib src/bin/check_vectors.rs -o target/cv2 && ./target/cv2 ../$FLAT"
check "C++  poly"    cpp/include/lombok_ecc.hpp "s/kPrimitivePoly = 0x11d/kPrimitivePoly = 0x11b/" bash -c "cd cpp && g++ -std=c++17 -O2 -o build/cv2 tests/check_vectors.cpp && ./build/cv2 ../$FLAT"

echo
echo "── Sabotase: message left-align (bug yang saya buat sendiri di codec) ──"
check "PHP  align"   php/src/ReedSolomon.php    "s/\\\$msg\[\\\$this->k - \\\$len + \\\$i\]/\\\$msg[\\\$i]/" php php/tests/check-vectors.php $JSON
check "Py   align"   python/lombok_ecc/__init__.py "s/msg\[self.k - len(message):\] = message/msg[0:len(message)] = message/" python3 python/tests/check_vectors.py $JSON
check "Go   align"   go/lombokecc.go            "s/copy(msg\[rs.K-len(message):\], message)/copy(msg, message)/" bash -c "cd go && GOCACHE=/tmp/gocache GOPATH=/tmp/gopath go run ./cmd/check-vectors ../$JSON"

echo "────────────────────────────"
[ $DEV -gt 0 ] && { echo "  $DEV harness BOCOR → GAGAL"; exit 1; }
echo "  semua sabotase terdeteksi"; exit 0
