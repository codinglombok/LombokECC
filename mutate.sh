#!/usr/bin/env bash
# Mutation testing for LombokECC.
#
# Injects a deliberate bug into the library, rebuilds, and checks that the
# named suite FAILS (non-zero exit). A mutation that survives means the suite
# does not actually test that code path.
#
# Usage: ./mutate.sh
set -u

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# run_mutation <name> <file> <from> <to> <suite> <expect: kill|survive>
#
# "survive" is only for mutations proven to be genuinely redundant, and it is
# still asserted: if such a mutation starts getting killed, that is reported as
# a mismatch too, because it means the code changed underneath the claim.
run_mutation() {
  local name="$1" file="$2" from="$3" to="$4" suite="$5" expect="${6:-kill}"

  local work="/tmp/mut_$$"
  rm -rf "$work"; cp -r "$SRC" "$work"; cd "$work" || return

  # Apply mutation; bail loudly if the pattern did not match.
  if ! grep -qF "$from" "$file"; then
    printf '  \033[33m?\033[0m %-52s PATTERN NOT FOUND in %s\n' "$name" "$file"
    FAIL=$((FAIL + 1)); cd "$SRC"; rm -rf "$work"; return
  fi
  python3 - "$file" "$from" "$to" <<'PY'
import sys, pathlib
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
f = pathlib.Path(p); s = f.read_text()
assert s.count(a) >= 1
f.write_text(s.replace(a, b, 1))
PY

  npx tsc >/dev/null 2>&1
  node "dist/${suite}.js" >/dev/null 2>&1
  local code=$?

  local actual="survive"
  [ "$code" -ne 0 ] && actual="kill"

  if [ "$actual" = "$expect" ]; then
    if [ "$actual" = "kill" ]; then
      printf '  \033[32mKILLED\033[0m   %-50s %s exits %s\n' "$name" "$suite" "$code"
    else
      printf '  \033[33mSURVIVED\033[0m %-50s expected (redundant)\n' "$name"
    fi
    PASS=$((PASS + 1))
  else
    if [ "$expect" = "kill" ]; then
      printf '  \033[31mSURVIVED\033[0m %-50s %s exits 0 <- TEST GAP\n' "$name" "$suite"
    else
      printf '  \033[31mKILLED\033[0m   %-50s expected to survive <- claim stale\n' "$name"
    fi
    FAIL=$((FAIL + 1))
  fi

  cd "$SRC"; rm -rf "$work"
}

echo "MUTATION TESTING — LombokECC"
echo "============================================================================"
echo
echo "GF(256) arithmetic (gf256.ts):"
run_mutation "primitive polynomial 0x11d -> 0x11b (alpha loses primitivity)" \
  gf256.ts "const PRIMITIVE_POLY = 0x11d;" "const PRIMITIVE_POLY = 0x11b;" test-gf-poly
run_mutation "mul: exp/log sum -> difference" \
  gf256.ts "this.exp[(this.log[a] + this.log[b]) % 255]" "this.exp[(this.log[a] - this.log[b] + 255) % 255]" test-gf-poly
run_mutation "inv: 255 - log -> 254 - log" \
  gf256.ts "this.exp[(255 - this.log[a]) % 255]" "this.exp[(254 - this.log[a]) % 255]" test-gf-poly

echo
echo "Generator polynomial (reed-solomon.ts):"
run_mutation "generator roots start at alpha^0 not alpha^1" \
  reed-solomon.ts "for (let i = 1; i <= deg; i++) {" "for (let i = 0; i < deg; i++) {" test-gf-poly
run_mutation "generator degree off-by-one" \
  reed-solomon.ts "for (let i = 1; i <= deg; i++) {" "for (let i = 1; i < deg; i++) {" test-gf-poly

echo
echo "Syndrome computation (reed-solomon.ts):"
run_mutation "syndrome uses alpha^i instead of alpha^(i+1)" \
  reed-solomon.ts "const alpha_i = this.gf.exp[(i + 1) % 255]; // α^(i+1)" "const alpha_i = this.gf.exp[i % 255];" test-gf-poly

echo
echo "Decoder — error location (reed-solomon.ts):"
run_mutation "Chien search: alpha^-pos -> alpha^+pos" \
  reed-solomon.ts "const alpha_neg_pos = this.gf.exp[(255 - pos) % 255];" "const alpha_neg_pos = this.gf.exp[pos % 255];" test-rs
run_mutation "error-value exponent (pos*(i+1)) -> (pos*i)" \
  reed-solomon.ts "const power = (pos * (i + 1)) % 255;" "const power = (pos * i) % 255;" test-rs

echo
echo "Decoder — guards (reed-solomon.ts):"
run_mutation "disable isValid() guard on corrected word" \
  reed-solomon.ts "if (!this.isValid(corrected)) {" "if (false) {" test-overcapacity
# Expected to survive: this guard is genuinely redundant. With it disabled and
# isValid(corrected) left in place, miscorrection stays 0/1400, within-capacity
# stays 1800/1800, and decode still throws via "Unable to locate errors". It is
# defense-in-depth and a clearer error message, not the load-bearing check.
run_mutation "disable errorPositions > t guard" \
  reed-solomon.ts "if (errorPositions.length > this.t) {" "if (false) {" test-overcapacity survive

echo
echo "Encoder (reed-solomon.ts):"
run_mutation "message padded left-aligned instead of right" \
  reed-solomon.ts "msg.set(message, this.k - message.length);" "msg.set(message, 0);" test-encode-only
run_mutation "parity placed after message instead of before" \
  reed-solomon.ts "msgShifted.set(msg, nMinusK);" "msgShifted.set(msg, 0);" test-gf-poly

echo
echo "============================================================================"
echo "sesuai ekspektasi: $PASS    menyimpang: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "Semua mutasi berperilaku sesuai ekspektasi."
  exit 0
else
  echo "Ada mutasi yang menyimpang dari ekspektasi — periksa sebelum publish."
  exit 1
fi
